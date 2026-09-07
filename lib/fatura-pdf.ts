import type { StatementLine } from '@/lib/statement';
import { parseBRNumber, parseDate, normalizeDescricao } from '@/lib/statement';

// Roda o pdf.js inteiro na thread principal, sem Web Worker (ver histórico
// de tentativas abaixo — essa parte já está resolvida).
async function extractPdfLines(file: File): Promise<string[]> {
  await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const lines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    // Encontrado a partir da pilha de erro real de um usuário (Safari/iOS):
    // page.getTextContent() por baixo dos panos faz `for await (const t of e)`
    // num ReadableStream (streamTextContent()) — e esse WebKit específico não
    // suporta iteração assíncrona nativa (`for await...of`) sobre ReadableStream,
    // travando com "undefined is not a function". streamTextContent() em si
    // funciona; só a forma como a própria lib consome ele quebra. Contorna lendo
    // o stream manualmente com getReader()/read(), sem depender de for-await-of.
    const items: any[] = [];
    const reader = page.streamTextContent().getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value?.items) items.push(...value.items);
    }
    const rows = new Map<number, { x: number; str: string }[]>();

    for (const item of items) {
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

// "encargos" saiu daqui de propósito: linhas de resumo tipo "Encargos
// (financiamento + moratório) 322,47" nunca batem no LINE_PATTERN mesmo (não
// têm uma data DD/MM na frente), mas "30/08 ENCARGOS DE ATRASO 51,91" é uma
// cobrança de verdade, com data, numa seção separada ("Lançamentos: produtos
// e serviços") — e barrar pelo nome escondia ela junto.
const IGNORAR_DESCRICAO = [
  /total/i, /saldo/i, /limite/i, /iof/i, /juros rotativo/i,
  /pagamento (?:recebido|efetuado)/i, /vencimento/i, /fatura anterior/i,
];

// Faturas (achado com uma fatura real do Itaú) costumam ter, perto do fim,
// uma seção só de PRÉVIA — "Compras parceladas - próximas faturas" — que
// reimprime cada compra parcelada com o número da parcela seguinte (ex.: a
// parcela 2/10 já é cobrada nesta fatura; a seção de prévia mostra a mesma
// compra como "3/10", que só vai ser cobrada na fatura do mês que vem). Isso
// não é lixo pra descartar: é a lista de compras que a fatura SEGUINTE vai
// cobrar, então extraímos separado (`proximaFatura`) pra já lançar na fatura
// certa — assim, quando o usuário importar o PDF do mês que vem, essas
// compras já estarem lançadas evita duplicar (mesma verificação de "já
// lançado" que a tela de importação já faz, comparando data+valor).
const CORTE_PREVIA = [/pr[oó]ximas faturas/i, /credi[aá]rio \(pr[oó]ximo per[ií]odo\)/i, /compras parceladas/i];

// A fatura já traz o total de encargos (juros de mora, multa por atraso, IOF
// de financiamento etc.) pronto numa única linha — mais confiável que somar
// as linhas individuais (que têm layout inconsistente entre bancos). Cai
// numa única compra/despesa "Encargos da fatura" em vez de ficar de fora.
const ENCARGOS_TOTAL_PATTERN = /total de encargos(?: em r\$)?\s*\$?\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})/i;

// Faturas quase sempre mostram a data da compra como "DD/MM", sem ano —
// diferente de extrato bancário, que costuma trazer o ano. Sem isso, infere
// o ano a partir da competência da fatura: compras de um mês "maior" que o
// da competência são do ano anterior (ex.: fatura de jan/2027 com compra
// lançada em 28/12 é de dez/2026, não de dez/2027).
// Faturas marcam parcela de formas inconsistentes até dentro do mesmo PDF:
// "2/12" solto, "(02/12)" entre parênteses, ou "Traini02/12" grudado direto
// no nome do estabelecimento (sem espaço, então o \b do normalizeDescricao
// não separa). Em vez de tentar prever cada variação, extrai o "N/M" de
// onde estiver — com ou sem parênteses, colado ou não — e recoloca sempre
// no mesmo formato no fim da descrição: "Nome (N/M)".
const PARCELA_PATTERN = /\(?(\d{1,2})\/(\d{1,2})\)?(?!\d)/;

function extrairParcela(descRaw: string): { texto: string; parcela: string | null } {
  const m = descRaw.match(PARCELA_PATTERN);
  if (!m || m.index === undefined) return { texto: descRaw, parcela: null };
  const atual = parseInt(m[1], 10);
  const total = parseInt(m[2], 10);
  // Faixa plausível de parcelamento — evita casar algo que por acaso pareça
  // "N/M" mas não seja parcela (ex. um código do estabelecimento).
  if (total < 1 || total > 60 || atual < 1 || atual > total) return { texto: descRaw, parcela: null };
  const texto = (descRaw.slice(0, m.index) + descRaw.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').trim();
  return { texto, parcela: `${atual}/${total}` };
}

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

function extrairCompras(lines: string[], competencia?: string): { compras: StatementLine[]; abatimentos: number } {
  const result: StatementLine[] = [];
  const vistos = new Set<string>();
  let abatimentos = 0;
  for (const rawLine of lines) {
    for (const match of Array.from(rawLine.matchAll(LINE_PATTERN))) {
      const [, dataRaw, descRaw, valorRaw] = match;

      const data = inferirData(dataRaw, competencia);
      if (!data) continue;

      const negativo = valorRaw.trim().endsWith('-');
      const valorNum = parseBRNumber(valorRaw.replace(/-\s*$/, ''));
      if (valorNum === null || valorNum === 0) continue;

      const { texto: descSemParcela, parcela } = extrairParcela(descRaw);
      const descricaoBase = normalizeDescricao(descSemParcela);
      const descricao = parcela ? `${descricaoBase} (${parcela})` : descricaoBase;
      if (
        IGNORAR_DESCRICAO.some((re) => re.test(descricao)) ||
        IGNORAR_DESCRICAO.some((re) => re.test(descRaw)) ||
        IGNORAR_DESCRICAO.some((re) => re.test(rawLine))
      ) continue;

      // Linhas de valor negativo na tabela de compras são abatimentos/estornos
      // pequenos (ex. "RAIA DROGASIL SA - 0,01") — não são compra nova, mas
      // também não podem simplesmente sumir: são exatamente a diferença que
      // sobra entre o valor lançado e o valor real da fatura. Sem somar isso
      // em algum lugar, o total das compras sempre fica um pouco alto — igual
      // aconteceu antes com os encargos. Pagamentos grandes (ex. "pagamento
      // efetuado" da fatura anterior) já saíram no filtro do IGNORAR_DESCRICAO
      // acima, então só sobra aqui abatimento de verdade.
      if (negativo || valorNum < 0) {
        abatimentos += Math.abs(valorNum);
        continue;
      }

      // Muitas faturas (ex.: Itaú) reimprimem, numa seção de "próximos encargos",
      // compras parceladas que já apareceram na lista principal — mesma data,
      // valor e descrição, com uma marca de parcela (ex. "01/03") no texto bruto
      // antes do valor. Só faz sentido descartar como repetição nesse caso: duas
      // compras avulsas (ex. duas corridas de "99*" no mesmo valor no mesmo dia)
      // não têm essa marca e são mantidas — não há como diferenciar "reimpresso"
      // de "coincidência" sem ela, e apagar a segunda seria perder uma compra real.
      // Como a descrição agora sempre inclui a parcela no mesmo formato, duas
      // parcelas diferentes da mesma compra (ex. "(2/10)" e "(3/10)") não batem
      // mais nessa chave — só uma reimpressão de verdade da MESMA parcela bate.
      if (parcela) {
        const chave = `${data}|${valorNum.toFixed(2)}|${descricao}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
      }

      result.push({ data, hora: null, descricao, valor: Math.abs(valorNum) });
    }
  }
  // Arredonda em centavos: `abatimentos +=` ao longo do loop soma em ponto
  // flutuante puro, que pode acumular erro binário (ex. 0.01 + 0.02 + 0.81
  // vira 0.8400000000000001 em vez de 0.84).
  return { compras: result, abatimentos: Math.round(abatimentos * 100) / 100 };
}

export interface FaturaParseResult {
  /** Compras já cobradas nesta fatura. */
  atual: StatementLine[];
  /** Compras parceladas que a própria fatura já avisa que só serão cobradas
   * na fatura seguinte (seção "Compras parceladas - próximas faturas"). */
  proximaFatura: StatementLine[];
  /** Total de juros/multa/IOF cobrados nesta fatura (0 quando não achado). */
  encargos: number;
  /** Soma de pequenos abatimentos/estornos (linhas de valor negativo na
   * tabela de compras desta fatura) — reduz o total, não é uma compra nova. */
  abatimentos: number;
  /** Idem, mas os que aparecem na seção de compras da fatura seguinte. */
  abatimentosProximaFatura: number;
}

export function parseFaturaPdfLines(linhasCompletas: string[], competencia?: string): FaturaParseResult {
  const corteIdx = linhasCompletas.findIndex((l) => CORTE_PREVIA.some((re) => re.test(l)));
  const linhasAtual = corteIdx === -1 ? linhasCompletas : linhasCompletas.slice(0, corteIdx);
  const linhasFutura = corteIdx === -1 ? [] : linhasCompletas.slice(corteIdx);

  let encargos = 0;
  for (const l of linhasCompletas) {
    const m = l.match(ENCARGOS_TOTAL_PATTERN);
    if (m) {
      const v = parseBRNumber(m[1]);
      if (v !== null) encargos = Math.abs(v);
    }
  }

  const doAtual = extrairCompras(linhasAtual, competencia);
  const doFutura = extrairCompras(linhasFutura, competencia);

  return {
    atual: doAtual.compras,
    proximaFatura: doFutura.compras,
    encargos,
    abatimentos: doAtual.abatimentos,
    abatimentosProximaFatura: doFutura.abatimentos,
  };
}

export async function parseFaturaPdf(file: File, competencia?: string): Promise<FaturaParseResult> {
  const lines = await extractPdfLines(file);
  return parseFaturaPdfLines(lines, competencia);
}
