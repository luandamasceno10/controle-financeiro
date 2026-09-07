import { describe, it, expect } from 'vitest';
import { parseFaturaPdfLines } from './fatura-pdf';

describe('parseFaturaPdfLines', () => {
  it('reconhece uma linha simples de compra', () => {
    const result = parseFaturaPdfLines(['15/08 UI CREPE 48,00'], '2026-09');
    expect(result).toEqual([{ data: '2026-08-15', hora: null, descricao: 'Ui Crepe', valor: 48 }]);
  });

  it('separa duas compras de colunas lado a lado que a extração juntou numa linha só', () => {
    // Faturas com layout em duas colunas (ex.: Itaú) fazem a extração por linha
    // visual juntar as duas compras da mesma altura da página numa string só.
    const result = parseFaturaPdfLines(
      ['30/08 AMAZON PRIME BR 12/12 13,90 23/08 CIA DO PAO LTDA 132,80'],
      '2026-09'
    );
    expect(result).toEqual([
      { data: '2026-08-30', hora: null, descricao: 'Amazon Prime Br', valor: 13.9 },
      { data: '2026-08-23', hora: null, descricao: 'Cia Do Pao Ltda', valor: 132.8 },
    ]);
  });

  it('ignora a linha de "pagamento efetuado" mesmo com uma data no meio da linha', () => {
    const result = parseFaturaPdfLines(
      ['62053-745 SOBRAL - CE Pagamento efetuado em 07/08/2026 - 12.497,30'],
      '2026-09'
    );
    expect(result).toEqual([]);
  });

  it('remove compras repetidas (mesma data, valor e descrição) — faturas costumam reimprimir parcelas futuras numa seção à parte', () => {
    const result = parseFaturaPdfLines(
      ['12/08 FARIAS BRITO 01/03 253,34', '12/08 FARIAS BRITO 01/03 253,34'],
      '2026-09'
    );
    expect(result).toHaveLength(1);
  });

  it('mantém duas compras distintas com mesma data e valor mas descrições diferentes', () => {
    const result = parseFaturaPdfLines(
      ['14/08 99* 6,88 28/07 BOULEVARD PH-CT 02/02 149,00', '14/08 99* 6,88 28/07 MATEUS SUPRM-CT DO02/02 528,10'],
      '2026-09'
    );
    const noventaENove = result.filter((r) => r.descricao === '99*');
    expect(noventaENove).toHaveLength(2);
  });

  it('ignora a seção de prévia "Compras parceladas - próximas faturas" (mostra a parcela seguinte de compras já cobradas nesta fatura)', () => {
    // Achado com uma fatura real: a seção principal cobra a parcela 2/10 de uma
    // compra; mais adiante, uma seção só de prévia lista a mesma compra como
    // 3/10 — mesmo valor, e o parcela-marker "3/10" não bate com "2/10" na
    // deduplicação por descrição, então sem cortar a seção inteira ela contava
    // em dobro.
    const result = parseFaturaPdfLines(
      [
        '07/07 BRASTEMP *BRAST02/10 466,98',
        'Compras parceladas - próximas faturas',
        '07/07 BRASTEMP *BRAST03/10 466,98',
      ],
      '2026-09'
    );
    expect(result).toEqual([{ data: '2026-07-07', hora: null, descricao: 'Brastemp *brast02/10', valor: 466.98 }]);
  });
});
