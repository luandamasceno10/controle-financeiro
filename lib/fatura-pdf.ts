import type { StatementLine } from '@/lib/statement';
import { parseBRNumber, parseDate, normalizeDescricao } from '@/lib/statement';

// Extrai o texto do PDF agrupando por linha visual (mesma posição Y na
// página) em vez de simplesmente concatenar tudo — faturas de cartão são
// tabelas, e sem isso a ordem das colunas se perde.
async function extractPdfLines(file: File): Promise<string[]> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const lines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; str: string }[]>();

    for (const item of content.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      // Arredonda o Y pra agrupar itens da mesma linha visual mesmo com
      // pequenas variações de fonte/baseline entre eles.
      const y = Math.round(item.transform[5] / 2) * 2;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x: item.transform[4], str: item.str });
    }

    const sortedY = Array.from(rows.keys()).sort((a, b) => b - a);
    for (const y of sortedY) {
      const row = rows.get(y)!.sort((a, b) => a.x - b.x);
      const line = row.map((r) => r.str).join(' ').replace(/\s+/g, ' ').trim();
      if (line) lines.push(line);
    }
  }

  return lines;
}

// Faturas de cartão não têm um layout padrão entre bancos — o que costuma se
// repetir é "data + descrição + valor" na mesma linha da tabela de compras.
// Casa (DD/MM ou DD/MM/AAAA) ... (valor em R$, com ou sem sinal) no fim da
// linha, ignorando linhas de cabeçalho/resumo que não têm esse formato.
const LINE_PATTERN = /^(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+?)\s+(-?R?\$?\s?\d{1,3}(?:\.\d{3})*,\d{2}-?)\s*$/;

const IGNORAR_DESCRICAO = [
  /total/i, /saldo/i, /limite/i, /encargos/i, /iof/i, /juros rotativo/i,
  /pagamento (?:recebido|efetuado)/i, /vencimento/i, /fatura anterior/i,
];

// Faturas quase sempre mostram a data da compra como "DD/MM", sem ano —
// diferente de extrato bancário, que costuma trazer o ano. Sem isso, infere
// o ano a partir da competência da fatura: compras de um mês "maior" que o
// da competência são do ano anterior (ex.: fatura de jan/2027 com compra
// lançada em 28/12 é de dez/2026, não de dez/2027).
function inferirData(dataRaw: string, competencia?: string): string | null {
  const semAno = dataRaw.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (semAno && competencia) {
    const [, d, m] = semAno;
    const [compAno, compMes] = competencia.split('-').map(Number);
    const mes = parseInt(m, 10);
    const ano = mes > compMes ? compAno - 1 : compAno;
    return `${ano}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return parseDate(dataRaw);
}

export function parseFaturaPdfLines(lines: string[], competencia?: string): StatementLine[] {
  const result: StatementLine[] = [];
  for (const rawLine of lines) {
    const match = rawLine.match(LINE_PATTERN);
    if (!match) continue;
    const [, dataRaw, descRaw, valorRaw] = match;

    const data = inferirData(dataRaw, competencia);
    if (!data) continue;

    const negativo = valorRaw.trim().endsWith('-');
    const valorNum = parseBRNumber(valorRaw.replace(/-\s*$/, ''));
    if (valorNum === null || valorNum === 0) continue;

    const descricao = normalizeDescricao(descRaw);
    if (IGNORAR_DESCRICAO.some((re) => re.test(descricao)) || IGNORAR_DESCRICAO.some((re) => re.test(descRaw))) continue;

    // Pagamentos/estornos aparecem como valor negativo na fatura — não são
    // compras novas, então não entram na lista de linhas para conciliar.
    if (negativo || valorNum < 0) continue;

    result.push({ data, hora: null, descricao, valor: Math.abs(valorNum) });
  }
  return result;
}

export async function parseFaturaPdf(file: File, competencia?: string): Promise<StatementLine[]> {
  const lines = await extractPdfLines(file);
  return parseFaturaPdfLines(lines, competencia);
}
