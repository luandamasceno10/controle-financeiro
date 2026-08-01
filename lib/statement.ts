export interface StatementLine {
  data: string;
  hora: string | null;
  descricao: string;
  valor: number;
}

function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/)[0] || '';
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return semicolons >= commas ? ';' : ',';
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseBRNumber(raw: string): number | null {
  let s = raw.trim().replace(/^"|"$/g, '').replace(/R\$\s?/i, '');
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()]/g, '').replace(/^-/, '');
  // Formato BR: 1.234,56 -> remove milhar, troca vírgula por ponto
  if (s.includes(',') && s.lastIndexOf(',') > s.lastIndexOf('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return negative ? -n : n;
}

function parseDate(raw: string): string | null {
  const s = raw.trim().replace(/^"|"$/g, '');
  // ISO: 2026-07-29
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // BR: 29/07/2026 ou 29/07/26
  const brMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function extractTime(raw: string): string | null {
  const s = raw.trim().replace(/^"|"$/g, '');
  const match = s.match(/([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?/);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

// Descrições de extrato bancário costumam vir com jargão do banco (tipo de
// operação, CPF/CNPJ, códigos de autenticação) — aqui reduzimos isso ao nome
// do destinatário/remetente, que é o que importa para reconhecer o lançamento.
const DESCRICAO_PREFIXOS = [
  'pix enviado para', 'pix recebido de', 'pix enviado', 'pix recebido', 'pix qr code', 'pix transferencia', 'pix transferência', 'pix',
  'transferencia enviada para', 'transferencia recebida de', 'transferência enviada para', 'transferência recebida de',
  'transferencia enviada', 'transferencia recebida', 'transferência enviada', 'transferência recebida', 'transferencia pix', 'transferência pix',
  'ted recebida de', 'ted enviada para', 'ted recebida', 'ted enviada', 'doc recebido de', 'doc enviado para', 'doc recebido', 'doc enviado',
  'compra cartao de debito', 'compra cartao de credito', 'compra no cartao de debito', 'compra no cartao de credito',
  'compra cartão de débito', 'compra cartão de crédito', 'compra cartao debito', 'compra cartao credito',
  'compra no debito', 'compra no débito', 'compra a debito', 'compra a débito', 'compra cartao', 'compra cartão', 'compra',
  'pagamento de boleto', 'pagamento boleto efetuado', 'pagamento efetuado', 'pagamento de conta', 'pagamento',
  'debito automatico', 'débito automático', 'saque', 'deposito', 'depósito', 'estorno de', 'estorno',
];

function normalizeDescricao(raw: string): string {
  let s = raw.trim().replace(/^"|"$/g, '');
  if (!s) return 'Lançamento importado';

  const lower = s.toLowerCase();
  const prefixosPorTamanho = [...DESCRICAO_PREFIXOS].sort((a, b) => b.length - a.length);
  for (const prefixo of prefixosPorTamanho) {
    if (lower.startsWith(prefixo)) {
      s = s.slice(prefixo.length);
      break;
    }
  }

  // Conectores que sobram depois do tipo de operação: "pelo Pix", "efetuado", etc.
  s = s
    .replace(/^\s*(pelo|pela|via|através de|atraves de)\s+pix\b/i, '')
    .replace(/^\s*(efetuado|efetuada|realizado|realizada|concluido|concluído|concluida|concluída)\b/i, '')
    .replace(/^[\s\-–:.,]+/, '');

  // Extratos costumam vir "NOME - CPF/CNPJ - BANCO (código) Agência: X Conta: Y" —
  // depois de remover o tipo de operação, o que interessa é sempre o primeiro pedaço.
  const partes = s.split(' - ').map((p) => p.trim()).filter(Boolean);
  if (partes.length > 1) s = partes[0];

  s = s
    .replace(/\s*\((?:transfer[eê]ncia|pix)[^)]*\)\s*$/i, '') // "(Transferência enviada)" repetido no fim
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, '') // CPF
    .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, '') // CNPJ
    .replace(/[•*]{2,}[\d.\-•*]*/g, '') // CPF/CNPJ mascarado (•••.777.377-••)
    .replace(/\b(cpf|cnpj)\b\.?:?/gi, '') // rótulos que sobram após remover o número
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, '') // datas soltas
    .replace(/\b([01]?\d|2[0-3]):([0-5]\d)(:[0-5]\d)?\b/g, '') // horários soltos
    .replace(/\b\d{6,}\b/g, '') // códigos de autenticação/documento longos
    .replace(/^[\s\-–:.,]+|[\s\-–:.,]+$/g, '') // separadores nas pontas
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!s) return raw.trim().replace(/^"|"$/g, '') || 'Lançamento importado';

  return s
    .split(' ')
    .map((word) => {
      const lowerWord = word.toLowerCase();
      if (['de', 'da', 'do', 'das', 'dos', 'e'].includes(lowerWord) && word !== word.toUpperCase()) return lowerWord;
      return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
    })
    .join(' ');
}

const HEADER_HINTS = {
  data: ['data', 'date', 'dt'],
  hora: ['hora', 'horario', 'horário', 'time'],
  descricao: ['descricao', 'descrição', 'historico', 'histórico', 'description', 'lançamento', 'lancamento', 'memo'],
  valor: ['valor', 'value', 'amount', 'montante'],
};

function findColumn(headers: string[], hints: string[]): number {
  const normalized = headers.map((h) => h.toLowerCase().trim());
  for (const hint of hints) {
    const idx = normalized.findIndex((h) => h.includes(hint));
    if (idx !== -1) return idx;
  }
  return -1;
}

export function parseStatementCSV(text: string): StatementLine[] {
  const cleanText = text.replace(/^﻿/, '');
  const lines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(cleanText);
  const rows = lines.map((l) => splitCsvLine(l, delimiter));

  const headerRow = rows[0];
  let dataIdx = findColumn(headerRow, HEADER_HINTS.data);
  let horaIdx = findColumn(headerRow, HEADER_HINTS.hora);
  let descIdx = findColumn(headerRow, HEADER_HINTS.descricao);
  let valorIdx = findColumn(headerRow, HEADER_HINTS.valor);

  let dataRows = rows;
  const hasHeader = dataIdx !== -1 || descIdx !== -1 || valorIdx !== -1;
  if (hasHeader) {
    dataRows = rows.slice(1);
  } else {
    // Sem cabeçalho reconhecível: assume ordem Data, Descrição, Valor
    dataIdx = 0; descIdx = 1; valorIdx = 2;
  }

  const result: StatementLine[] = [];
  for (const row of dataRows) {
    if (row.length < 2) continue;
    const dataRaw = row[dataIdx] ?? '';
    const descRaw = row[descIdx] ?? '';
    const valorRaw = row[valorIdx] ?? '';

    const data = parseDate(dataRaw);
    const valor = parseBRNumber(valorRaw);
    if (!data || valor === null || valor === 0) continue;

    // Hora pode vir em coluna própria, ou embutida junto da data/descrição (ex: "29/07/2026 14:32")
    const hora = horaIdx !== -1 ? extractTime(row[horaIdx] ?? '') : (extractTime(dataRaw) || extractTime(descRaw));

    result.push({ data, hora, descricao: normalizeDescricao(descRaw), valor });
  }

  return result;
}
