import { describe, it, expect } from 'vitest';
import { competenciaForPurchase, shiftPurchaseDate, shiftCompetencia, estimatedVencimento } from './faturas';
import type { CartaoCredito } from './supabase';

describe('competenciaForPurchase', () => {
  // Caso mais comum: fechamento perto do fim do mês, vencimento no começo do
  // mês seguinte (dia_vencimento < dia_fechamento) — a fatura sempre vence no
  // mês seguinte ao fechamento.
  describe('quando o vencimento cai no mês seguinte ao fechamento', () => {
    it('compra até o dia de fechamento cai na fatura do mês seguinte', () => {
      expect(competenciaForPurchase('2026-07-15', 30, 6)).toBe('2026-08');
      expect(competenciaForPurchase('2026-07-30', 30, 6)).toBe('2026-08');
    });

    it('compra depois do fechamento cai na fatura de dois meses à frente', () => {
      expect(competenciaForPurchase('2026-07-31', 30, 6)).toBe('2026-09');
    });

    it('fechamento cai no fim de fevereiro (clamp de mês curto)', () => {
      // dia_fechamento=30 num fevereiro de 28 dias vira dia 28 efetivo
      expect(competenciaForPurchase('2026-02-28', 30, 6)).toBe('2026-03');
      expect(competenciaForPurchase('2026-02-27', 30, 6)).toBe('2026-03');
    });

    it('nunca retorna o mesmo mês da compra', () => {
      for (let dia = 1; dia <= 28; dia++) {
        const dataISO = `2026-05-${String(dia).padStart(2, '0')}`;
        expect(competenciaForPurchase(dataISO, 15, 6)).not.toBe('2026-05');
      }
    });
  });

  // Bug relatado em produção: cartão que fecha e vence dentro do mesmo mês
  // (dia_vencimento >= dia_fechamento) — antes da correção, o offset mínimo
  // de 1 mês jogava a compra sempre pro mês errado.
  describe('quando o vencimento cai no mesmo mês do fechamento', () => {
    it('compra até o dia de fechamento cai na fatura do próprio mês', () => {
      // Cartão Santander: fecha dia 13, vence dia 20 — compra do dia 02/08
      // tem que cair na fatura de agosto (fecha 13/08, vence 20/08).
      expect(competenciaForPurchase('2026-08-02', 13, 20)).toBe('2026-08');
      expect(competenciaForPurchase('2026-08-13', 13, 20)).toBe('2026-08');
    });

    it('compra depois do fechamento cai na fatura do mês seguinte', () => {
      expect(competenciaForPurchase('2026-08-14', 13, 20)).toBe('2026-09');
    });

    it('cartão que fecha dia 1: só a compra do próprio dia 1 cai no mesmo mês', () => {
      expect(competenciaForPurchase('2026-07-01', 1, 8)).toBe('2026-07');
      expect(competenciaForPurchase('2026-07-02', 1, 8)).toBe('2026-08');
    });
  });
});

describe('shiftPurchaseDate', () => {
  it('avança a data em N meses mantendo o dia', () => {
    expect(shiftPurchaseDate('2026-08-08', 1)).toBe('2026-09-08');
    expect(shiftPurchaseDate('2026-08-08', 3)).toBe('2026-11-08');
  });

  it('delta 0 retorna a mesma data', () => {
    expect(shiftPurchaseDate('2026-08-08', 0)).toBe('2026-08-08');
  });

  it('faz clamp quando o mês de destino é mais curto (dia 31 -> 30/28/29)', () => {
    expect(shiftPurchaseDate('2026-01-31', 1)).toBe('2026-02-28');
    expect(shiftPurchaseDate('2026-01-31', 3)).toBe('2026-04-30');
  });

  it('parcela a parcela em compra parcelada gera faturas em meses consecutivos', () => {
    const cartaoFechamento = 13;
    const cartaoVencimento = 6;
    const datas = [0, 1, 2, 3].map((i) => shiftPurchaseDate('2026-08-08', i));
    const competencias = datas.map((d) => competenciaForPurchase(d, cartaoFechamento, cartaoVencimento));
    expect(competencias).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
  });
});

describe('shiftCompetencia', () => {
  it('avança e volta competência em meses', () => {
    expect(shiftCompetencia('2026-08', 1)).toBe('2026-09');
    expect(shiftCompetencia('2026-08', -1)).toBe('2026-07');
  });

  it('atravessa virada de ano nos dois sentidos', () => {
    expect(shiftCompetencia('2026-12', 1)).toBe('2027-01');
    expect(shiftCompetencia('2026-01', -1)).toBe('2025-12');
  });
});

describe('estimatedVencimento', () => {
  const cartao = { dia_vencimento: 10 } as CartaoCredito;

  it('usa o dia de vencimento dentro do mês de competência', () => {
    expect(estimatedVencimento(cartao, '2026-08')).toBe('2026-08-10');
  });

  it('faz clamp quando o dia de vencimento não existe no mês', () => {
    const cartao31 = { dia_vencimento: 31 } as CartaoCredito;
    expect(estimatedVencimento(cartao31, '2026-02')).toBe('2026-02-28');
  });
});
