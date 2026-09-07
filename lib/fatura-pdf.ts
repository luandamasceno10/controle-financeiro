import type { StatementLine } from '@/lib/statement';
import { parseBRNumber, parseDate, normalizeDescricao } from '@/lib/statement';

// Usa a build "legacy" do pdfjs-dist (em vez de 'pdfjs-dist' direto), que traz
// polyfills embutidos (core-js) para APIs recentes como Promise.withResolvers().
// A build padrão chama isso sem fallback e quebra com "undefined is not a
// function" em iOS/Safari mais antigos — a legacy é o próprio pacote resolvendo
// isso, em vez de um polyfill nosso tentando adivinhar tudo que falta.
// public/pdf.worker.min.mjs é copiado da legacy também (ver postinstall).

// Extrai o texto do PDF agrupando por linha visual (mesma posição Y na
// página) em vez de simplesmente concatenar tudo — faturas de cartão são
// tabelas, e sem isso a ordem das colunas se perde.
async function extractPdfLines(file: File): Promise<string[]> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Query string com a versão do pacote: /pdf.worker.min.mjs é um arquivo
  // estático de nome fixo em public/, então uma versão em cache (do navegador
  // ou da CDN) sobreviveria a um deploy que só trocou o conteúdo do arquivo,
  // sem trocar a URL — cada troca de versão do pdfjs-dist força um fetch novo.
  pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjsLib.version}-legacy1`;

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
// repetir é "data + descrição + valor" em algum trecho da linha da tabela de
// compras. Casa (DD/MM ou DD/MM/AAAA) ... (valor em R$, com ou sem sinal),
// ignorando linhas de cabeçalho/resumo que não têm esse formato.
//
// Sem âncora de início/fim (^...$) e com busca global: várias faturas (ex.
// Itaú) imprimem duas colunas de lançamentos lado a lado na mesma altura da
// página, e a extração por linha visual junta as duas em uma string só, tipo
// "30/08 AMAZON PRIME BR 12/12 13,90 23/08 CIA DO PAO LTDA 132,80". A busca
// global com descrição "preguiçosa" (.+?) encontra as duas compras nessa
// mesma linha em vez de misturar a data de uma com o valor da outra.
const LINE_PATTERN = /(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+?)\s+(-?R?\$?\s?\d{1,3}(?:\.\d{3})*,\d{2}-?)(?=\s|$)/g;

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
  const vistos = new Set<string>();
  for (const rawLine of lines) {
    for (const match of Array.from(rawLine.matchAll(LINE_PATTERN))) {
      const [, dataRaw, descRaw, valorRaw] = match;

      const data = inferirData(dataRaw, competencia);
      if (!data) continue;

      const negativo = valorRaw.trim().endsWith('-');
      const valorNum = parseBRNumber(valorRaw.replace(/-\s*$/, ''));
      if (valorNum === null || valorNum === 0) continue;

      const descricao = normalizeDescricao(descRaw);
      if (
        IGNORAR_DESCRICAO.some((re) => re.test(descricao)) ||
        IGNORAR_DESCRICAO.some((re) => re.test(descRaw)) ||
        IGNORAR_DESCRICAO.some((re) => re.test(rawLine))
      ) continue;

      // Pagamentos/estornos aparecem como valor negativo na fatura — não são
      // compras novas, então não entram na lista de linhas para conciliar.
      if (negativo || valorNum < 0) continue;

      // Muitas faturas (ex.: Itaú) reimprimem, numa seção de "próximos encargos",
      // compras parceladas que já apareceram na lista principal — mesma data,
      // valor e descrição, com uma marca de parcela (ex. "01/03") no texto bruto
      // antes do valor. Só faz sentido descartar como repetição nesse caso: duas
      // compras avulsas (ex. duas corridas de "99*" no mesmo valor no mesmo dia)
      // não têm essa marca e são mantidas — não há como diferenciar "reimpresso"
      // de "coincidência" sem ela, e apagar a segunda seria perder uma compra real.
      if (/\b\d{1,2}\/\d{1,2}\b/.test(descRaw)) {
        const chave = `${data}|${valorNum.toFixed(2)}|${descricao}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
      }

      result.push({ data, hora: null, descricao, valor: Math.abs(valorNum) });
    }
  }
  return result;
}

export async function parseFaturaPdf(file: File, competencia?: string): Promise<StatementLine[]> {
  const lines = await extractPdfLines(file);
  return parseFaturaPdfLines(lines, competencia);
}
