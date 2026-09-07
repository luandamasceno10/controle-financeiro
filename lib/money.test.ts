import { describe, it, expect } from 'vitest';
import { sumMoney } from './money';

describe('sumMoney', () => {
  it('soma valores decimais sem acumular erro de ponto flutuante', () => {
    // 0.1 + 0.2 puro em JS já dá 0.30000000000000004
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
  });

  it('bate com uma soma de ~100 valores que costuma derivar em float puro', () => {
    const valores = Array.from({ length: 116 }, (_, i) => 13.31 + i * 0.01);
    const somaFloat = valores.reduce((s, v) => s + v, 0);
    const somaCerta = Math.round(somaFloat * 100) / 100;
    expect(sumMoney(valores)).toBe(somaCerta);
  });

  it('lista vazia soma 0', () => {
    expect(sumMoney([])).toBe(0);
  });

  it('funciona com valores negativos (abatimentos/estornos)', () => {
    expect(sumMoney([100, -0.01, -0.02, -0.81])).toBeCloseTo(99.16);
  });
});
