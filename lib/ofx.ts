import { normalizeDescricao, type StatementLine } from './statement';

// OFX 1.x é SGML, não XML — tags de folha não têm fechamento obrigatório
// (ex: <TRNAMT>-21.00 sem </TRNAMT>). Por isso a extração é feita com regex
// por bloco <STMTTRN>...</STMTTRN>, em vez de um parser de XML de verdade.

function extractTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}>\\s*([^<\\r\\n]*)`, 'i'));
  return match ? match[1].trim() : null;
}

function parseOfxDate(raw: string): { data: string; hora: string | null } | null {
  // Formatos comuns: YYYYMMDD, YYYYMMDDHHMMSS, YYYYMMDDHHMMSS[-3:BRT], YYYYMMDDHHMMSS.000[-3:BRT]
  const s = raw.trim();
  const match = s.match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?/);
  if (!match) return null;
  const [, y, m, d, hh, mm, ss] = match;
  const data = `${y}-${m}-${d}`;
  const hora = hh && mm ? `${hh}:${mm}` : null;
  return { data, hora };
}

function parseOfxAmount(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function parseOFX(text: string): StatementLine[] {
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  const result: StatementLine[] = [];

  for (const block of blocks) {
    const dtRaw = extractTag(block, 'DTPOSTED');
    const amtRaw = extractTag(block, 'TRNAMT');
    const memo = extractTag(block, 'MEMO') || extractTag(block, 'NAME') || '';

    if (!dtRaw || !amtRaw) continue;
    const parsedDate = parseOfxDate(dtRaw);
    const valor = parseOfxAmount(amtRaw);
    if (!parsedDate || valor === null || valor === 0) continue;

    result.push({
      data: parsedDate.data,
      hora: parsedDate.hora,
      descricao: normalizeDescricao(memo),
      valor,
    });
  }

  return result;
}
