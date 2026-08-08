import { describe, it, expect } from 'vitest';
import { normalizeDescricao, parseStatementCSV } from './statement';

describe('normalizeDescricao', () => {
  it('remove o prefixo de operação e mantém só o nome', () => {
    expect(normalizeDescricao('Pix enviado para Antonio Valmir Pereira Vieira')).toBe('Antonio Valmir Pereira Vieira');
  });

  it('descarta CPF, banco, agência e conta que vêm depois do nome (segmentos " - ")', () => {
    const raw = 'Pelo Pix - Antonio Valmir Pereira Vieira - •••.777.377-•• - Bco Bradesco S.a. (0237) Agência: 726 Conta: 10257-1';
    expect(normalizeDescricao(raw)).toBe('Antonio Valmir Pereira Vieira');
  });

  it('prefixo mais longo tem prioridade sobre um mais curto que também bate', () => {
    // "pagamento de boleto" não pode ser cortado pelo "pagamento" mais curto,
    // senão sobra "de boleto efetuado" no início da descrição.
    expect(normalizeDescricao('Pagamento de boleto efetuado Energisa')).toBe('Energisa');
  });

  it('remove CPF e CNPJ mesmo sem estarem em segmento próprio', () => {
    expect(normalizeDescricao('Compra cartao 123.456.789-00 Mercado Livre')).toBe('Mercado Livre');
  });

  it('capitaliza preservando conectores em minúsculo', () => {
    expect(normalizeDescricao('Pix recebido de joao da silva')).toBe('Joao da Silva');
  });

  it('descrição vazia ou só com ruído cai no fallback', () => {
    expect(normalizeDescricao('')).toBe('Lançamento importado');
    expect(normalizeDescricao('Pix')).toBe('Pix');
  });
});

describe('parseStatementCSV', () => {
  it('lê CSV com cabeçalho em português e delimitador vírgula', () => {
    const csv = 'Data,Descrição,Valor\n2026-07-29,Pix enviado para Maria,-150.5\n2026-07-30,Salário,3000.00';
    const rows = parseStatementCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ data: '2026-07-29', descricao: 'Maria', valor: -150.5 });
    expect(rows[1]).toMatchObject({ data: '2026-07-30', descricao: 'Salário', valor: 3000 });
  });

  it('detecta delimitador ponto e vírgula e formato de número BR (1.234,56)', () => {
    const csv = 'Data;Descrição;Valor\n29/07/2026;Compra Supermercado;-1.234,56';
    const rows = parseStatementCSV(csv);
    expect(rows[0]).toMatchObject({ data: '2026-07-29', valor: -1234.56 });
  });

  it('sem cabeçalho reconhecível, assume ordem Data, Descrição, Valor', () => {
    const csv = '2026-08-01,Compra Padaria,-25.90';
    const rows = parseStatementCSV(csv);
    expect(rows[0]).toMatchObject({ data: '2026-08-01', descricao: 'Padaria', valor: -25.9 });
  });

  it('descarta linhas com valor zero ou sem data válida', () => {
    const csv = 'Data,Descrição,Valor\n2026-08-01,Estorno,0\ndata-invalida,Algo,10';
    const rows = parseStatementCSV(csv);
    expect(rows).toHaveLength(0);
  });

  it('extrai horário embutido na coluna de data', () => {
    const csv = 'Data,Descrição,Valor\n29/07/2026 14:32,Pix enviado para Carlos,-50';
    const rows = parseStatementCSV(csv);
    expect(rows[0].hora).toBe('14:32');
  });
});
