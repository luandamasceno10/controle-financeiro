import { describe, it, expect } from 'vitest';
import { parseOFX } from './ofx';

function ofxWith(transactions: string): string {
  return `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>${transactions}</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
}

describe('parseOFX', () => {
  it('extrai data, hora exata, valor e descrição de uma transação', () => {
    const block = `<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260729143200[-3:BRT]</DTPOSTED><TRNAMT>-150.50</TRNAMT><MEMO>Pix enviado para Maria</MEMO></STMTTRN>`;
    const rows = parseOFX(ofxWith(block));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ data: '2026-07-29', hora: '14:32', valor: -150.5, descricao: 'Maria' });
  });

  // Bug real de produção: o extrato do Nubank sempre manda 000000 como hora
  // (não é a hora real da transação) — precisa virar "sem horário", não "00:00".
  it('trata hora 000000 (Nubank) como ausente, não como meia-noite', () => {
    const block = `<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260701000000[-3:BRT]</DTPOSTED><TRNAMT>-25.00</TRNAMT><MEMO>Compra Padaria</MEMO></STMTTRN>`;
    const rows = parseOFX(ofxWith(block));
    expect(rows[0].hora).toBeNull();
  });

  it('lida com DTPOSTED só com data, sem hora', () => {
    const block = `<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260701</DTPOSTED><TRNAMT>-25.00</TRNAMT><MEMO>Compra Padaria</MEMO></STMTTRN>`;
    const rows = parseOFX(ofxWith(block));
    expect(rows[0]).toMatchObject({ data: '2026-07-01', hora: null });
  });

  it('usa NAME quando MEMO não existe', () => {
    const block = `<STMTTRN><DTPOSTED>20260701</DTPOSTED><TRNAMT>100.00</TRNAMT><NAME>Salário</NAME></STMTTRN>`;
    const rows = parseOFX(ofxWith(block));
    expect(rows[0].descricao).toBe('Salário');
  });

  it('descarta transações com valor zero', () => {
    const block = `<STMTTRN><DTPOSTED>20260701</DTPOSTED><TRNAMT>0.00</TRNAMT><MEMO>Estorno</MEMO></STMTTRN>`;
    expect(parseOFX(ofxWith(block))).toHaveLength(0);
  });

  it('processa múltiplas transações no mesmo arquivo', () => {
    const blocks = [
      `<STMTTRN><DTPOSTED>20260701</DTPOSTED><TRNAMT>-10.00</TRNAMT><MEMO>A</MEMO></STMTTRN>`,
      `<STMTTRN><DTPOSTED>20260702</DTPOSTED><TRNAMT>-20.00</TRNAMT><MEMO>B</MEMO></STMTTRN>`,
    ].join('');
    expect(parseOFX(ofxWith(blocks))).toHaveLength(2);
  });

  it('arquivo sem transações retorna lista vazia', () => {
    expect(parseOFX(ofxWith(''))).toEqual([]);
  });
});
