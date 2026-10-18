import type { StatementLine } from '@/lib/statement';
import { parseBRNumber, parseDate, normalizeDescricao } from '@/lib/statement';

export interface FaturaParseResult {
  atual: StatementLine[];
  proximaFatura: StatementLine[];
  encargos: number;
  abatimentos: number;
  abatimentosProximaFatura: number;
}

// Parse markdown de fatura do Itaú
export function parseFaturaMd(content: string, competencia?: string): FaturaParseResult {
  const lines = content.split('\n');
  const atual: StatementLine[] = [];
  const proximaFatura: StatementLine[] = [];
  let encargos = 0;
  let abatimentos = 0;
  let abatimentosProximaFatura = 0;
  let inCurrentTransactions = false;
  let inNextTransactions = false;
  let inChargesSection = false;
  const vistos = new Set<string>();

  // Procura por seções de lançamentos
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detectar seções
    if (/lançamentos.*compras.*saques|compras\s+e\s+saques|lançamentos.*produtos.*serviços/i.test(line) && !inNextTransactions) {
      inCurrentTransactions = true;
      inNextTransactions = false;
      inChargesSection = false;
      continue;
    }
    if (/compras parceladas.*próximas faturas/i.test(line)) {
      inCurrentTransactions = false;
      inNextTransactions = true;
      inChargesSection = false;
      continue;
    }
    if (/encargos cobrados nesta fatura|lançamentos internacionais/i.test(line)) {
      inCurrentTransactions = false;
      inNextTransactions = false;
      inChargesSection = true;
      continue;
    }

    // Skip linhas que são separadores de tabela ou headers
    if (/^\|?\s*---+\s*\|?|^\|?\s*data|^\|?\s*descrição/i.test(line)) {
      continue;
    }

    // Parse linha de transação - flexível para tabelas e texto
    // Formatos suportados:
    // "DD/MM DESCRICAO ... R$ VALOR"
    // "| DD/MM | DESCRICAO | R$ VALOR |"
    // "DD/MM | DESCRICAO | VALOR"
    // Detectar se há múltiplas transações na mesma linha (layout de duas colunas)
    const allDates = line.match(/(\d{2}\/\d{2})/g) || [];
    const allValues = line.match(/(-?\d{1,3}(?:\.\d{3})*,\d{2})/g) || [];

    // Se há múltiplas datas e valores, tentar split por padrão de duas colunas
    if (allDates.length >= 2 && allValues.length >= 2 && (inCurrentTransactions || inNextTransactions)) {
      // Padrão: "DD/MM DESC VAL DD/MM DESC VAL" ou com pipes
      const doubleMatch = line.match(/(\d{2}\/\d{2})\s+([^,]*?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*\|?\s*(\d{2}\/\d{2})\s+([^,]*?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})/);
      if (doubleMatch) {
        // Processar duas transações
        const transacoes = [
          { data: doubleMatch[1], desc: doubleMatch[2], valor: doubleMatch[3] },
          { data: doubleMatch[4], desc: doubleMatch[5], valor: doubleMatch[6] },
        ];

        for (const tx of transacoes) {
          const data = inferirData(tx.data, competencia);
          if (!data) continue;

          const valorNum = parseBRNumber(tx.valor);
          if (valorNum === null || valorNum === 0) continue;

          const { texto: descSemParcela, parcela } = extrairParcela(tx.desc.trim());
          const descricaoBase = normalizeDescricao(descSemParcela);
          const descricao = parcela ? `${descricaoBase} (${parcela})` : descricaoBase;

          if (/total|saldo|limite|compras dessa fatura|lançamentos no cartão|próxima fatura|demais faturas/i.test(descricao)) continue;

          const chave = `${data}|${valorNum.toFixed(2)}|${descricao}`;
          if (vistos.has(chave)) continue;
          vistos.add(chave);

          const stmt: StatementLine = { data, hora: null, descricao, valor: Math.abs(valorNum) };
          if (inCurrentTransactions) atual.push(stmt);
          else if (inNextTransactions) proximaFatura.push(stmt);
        }
        continue;
      }
    }

    const transacaoMatch = line.match(/\|?\s*(\d{2}\/\d{2})\s+\|?\s*(.+?)\s+\|?\s*(-?R?\$?\s*\d{1,3}(?:\.\d{3})*,\d{2})/);
    if (transacaoMatch && (inCurrentTransactions || inNextTransactions)) {
      const [, dataRaw, descRaw, valorRaw] = transacaoMatch;

      const data = inferirData(dataRaw, competencia);
      if (!data) continue;

      const negativo = valorRaw.includes('-');
      const valorNum = parseBRNumber(valorRaw.replace(/R?\$|\s/g, ''));
      if (valorNum === null || valorNum === 0) continue;

      // Extrair parcela
      const { texto: descSemParcela, parcela } = extrairParcela(descRaw);
      const descricaoBase = normalizeDescricao(descSemParcela);
      const descricao = parcela ? `${descricaoBase} (${parcela})` : descricaoBase;

      // Filtrar descrições conhecidas a ignorar
      if (
        /total|saldo|limite|compras dessa fatura|lançamentos no cartão|próxima fatura|demais faturas/i.test(descricao) ||
        /total|saldo|limite|compras dessa fatura|lançamentos no cartão|próxima fatura|demais faturas/i.test(descRaw)
      ) {
        continue;
      }

      // Valores negativos são abatimentos
      if (negativo || valorNum < 0) {
        if (inCurrentTransactions) {
          abatimentos += Math.abs(valorNum);
        } else {
          abatimentosProximaFatura += Math.abs(valorNum);
        }
        continue;
      }

      // Evitar duplicatas
      const chave = `${data}|${valorNum.toFixed(2)}|${descricao}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);

      const stmt: StatementLine = {
        data,
        hora: null,
        descricao,
        valor: Math.abs(valorNum),
      };

      if (inCurrentTransactions) {
        atual.push(stmt);
      } else if (inNextTransactions) {
        proximaFatura.push(stmt);
      }
    }

    // Parse encargos: "IOF de financiamento ... R$ XX,XX"
    if (inChargesSection) {
      const encargosMatch = line.match(/IOF de financiamento.*?(-?\d{1,3}(?:\.\d{3})*,\d{2})/i);
      if (encargosMatch) {
        const v = parseBRNumber(encargosMatch[1]);
        if (v !== null) encargos = Math.abs(v);
      }
    }
  }

  // Arredondar abatimentos
  abatimentos = Math.round(abatimentos * 100) / 100;
  abatimentosProximaFatura = Math.round(abatimentosProximaFatura * 100) / 100;

  return {
    atual,
    proximaFatura,
    encargos,
    abatimentos,
    abatimentosProximaFatura,
  };
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

function extrairParcela(descRaw: string): { texto: string; parcela: string | null } {
  const PARCELA_PATTERN = /\(?(\d{1,2})\/(\d{1,2})\)?(?!\d)/;
  const m = descRaw.match(PARCELA_PATTERN);
  if (!m || m.index === undefined) return { texto: descRaw, parcela: null };
  const atual = parseInt(m[1], 10);
  const total = parseInt(m[2], 10);
  if (total < 1 || total > 60 || atual < 1 || atual > total) return { texto: descRaw, parcela: null };
  const texto = (descRaw.slice(0, m.index) + descRaw.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').trim();
  return { texto, parcela: `${atual}/${total}` };
}
