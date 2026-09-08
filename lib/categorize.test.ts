import { describe, it, expect } from 'vitest';
import { normalizarDescricao, categoriaPorHistorico } from './categorize';

describe('normalizarDescricao', () => {
  it('remove acento, caixa, números e pontuação', () => {
    expect(normalizarDescricao('UBER *TRIP HELP.UBER.C 12/34')).toBe('uber trip help uber c');
  });

  it('trata nomes com acento igual ao sem acento', () => {
    expect(normalizarDescricao('Pão de Açúcar')).toBe(normalizarDescricao('Pao de Acucar'));
  });
});

describe('categoriaPorHistorico', () => {
  const historico = [
    { descricaoNorm: normalizarDescricao('Uber'), categoria: 'Transporte' },
    { descricaoNorm: normalizarDescricao('iFood'), categoria: 'Alimentação' },
  ];

  it('bate exatamente quando a descrição normalizada é igual', () => {
    expect(categoriaPorHistorico('UBER', historico)).toBe('Transporte');
  });

  it('bate por semelhança quando a descrição do PDF tem mais texto em volta', () => {
    expect(categoriaPorHistorico('UBER *TRIP HELP.UBER.C 12/34', historico)).toBe('Transporte');
    expect(categoriaPorHistorico('IFOOD *IFOOD CLONE 99887766', historico)).toBe('Alimentação');
  });

  it('não bate quando não há nada parecido no histórico', () => {
    expect(categoriaPorHistorico('Posto Shell Ipiranga', historico)).toBeNull();
  });

  it('ignora descrições curtas demais pra evitar falso positivo', () => {
    expect(categoriaPorHistorico('a', historico)).toBeNull();
  });
});
