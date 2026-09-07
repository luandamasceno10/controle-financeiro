import { describe, it, expect } from 'vitest';
import { parseFaturaPdfLines } from './fatura-pdf';

describe('parseFaturaPdfLines', () => {
  it('reconhece uma linha simples de compra', () => {
    const result = parseFaturaPdfLines(['15/08 UI CREPE 48,00'], '2026-09');
    expect(result.atual).toEqual([{ data: '2026-08-15', hora: null, descricao: 'Ui Crepe', valor: 48 }]);
    expect(result.proximaFatura).toEqual([]);
    expect(result.encargos).toBe(0);
  });

  it('separa duas compras de colunas lado a lado que a extração juntou numa linha só', () => {
    // Faturas com layout em duas colunas (ex.: Itaú) fazem a extração por linha
    // visual juntar as duas compras da mesma altura da página numa string só.
    const result = parseFaturaPdfLines(
      ['30/08 AMAZON PRIME BR 12/12 13,90 23/08 CIA DO PAO LTDA 132,80'],
      '2026-09'
    );
    expect(result.atual).toEqual([
      { data: '2026-08-30', hora: null, descricao: 'Amazon Prime Br (12/12)', valor: 13.9 },
      { data: '2026-08-23', hora: null, descricao: 'Cia Do Pao Ltda', valor: 132.8 },
    ]);
  });

  it('padroniza a marca de parcela num formato único, venha ela colada, solta ou entre parênteses', () => {
    const result = parseFaturaPdfLines(
      [
        '10/08 LOJA A 2/12 100,00',
        '10/08 LOJA B (02/12) 100,00',
        '10/08 LOJA CTraini03/12 100,00',
      ],
      '2026-09'
    );
    expect(result.atual.map((r) => r.descricao)).toEqual([
      'Loja A (2/12)',
      'Loja B (2/12)',
      'Loja Ctraini (3/12)',
    ]);
  });

  it('ignora a linha de "pagamento efetuado" mesmo com uma data no meio da linha', () => {
    const result = parseFaturaPdfLines(
      ['62053-745 SOBRAL - CE Pagamento efetuado em 07/08/2026 - 12.497,30'],
      '2026-09'
    );
    expect(result.atual).toEqual([]);
  });

  it('remove compras repetidas (mesma data, valor e descrição) — faturas costumam reimprimir parcelas futuras numa seção à parte', () => {
    const result = parseFaturaPdfLines(
      ['12/08 FARIAS BRITO 01/03 253,34', '12/08 FARIAS BRITO 01/03 253,34'],
      '2026-09'
    );
    expect(result.atual).toHaveLength(1);
  });

  it('mantém duas compras distintas com mesma data e valor mas descrições diferentes', () => {
    const result = parseFaturaPdfLines(
      ['14/08 99* 6,88 28/07 BOULEVARD PH-CT 02/02 149,00', '14/08 99* 6,88 28/07 MATEUS SUPRM-CT DO02/02 528,10'],
      '2026-09'
    );
    const noventaENove = result.atual.filter((r) => r.descricao === '99*');
    expect(noventaENove).toHaveLength(2);
  });

  it('separa a seção "Compras parceladas - próximas faturas" em vez de descartar', () => {
    // Achado com uma fatura real: a seção principal cobra a parcela 2/10 de uma
    // compra; mais adiante, uma seção só de prévia lista a mesma compra como
    // 3/10 — mesmo valor. Antes isso era só cortado fora; agora extraímos como
    // "próxima fatura" pra já lançar no mês certo.
    const result = parseFaturaPdfLines(
      [
        '07/07 BRASTEMP *BRAST02/10 466,98',
        'Compras parceladas - próximas faturas',
        '07/07 BRASTEMP *BRAST03/10 466,98',
      ],
      '2026-09'
    );
    expect(result.atual).toEqual([{ data: '2026-07-07', hora: null, descricao: 'Brastemp *brast (2/10)', valor: 466.98 }]);
    expect(result.proximaFatura).toEqual([{ data: '2026-07-07', hora: null, descricao: 'Brastemp *brast (3/10)', valor: 466.98 }]);
  });

  it('extrai o total de encargos de uma linha única', () => {
    const result = parseFaturaPdfLines(
      [
        'Juros de mora 1,00 % am 4,16',
        'Multa por atraso 2,00 % 249,93',
        'IOF de financiamento (0,38 % + 0,00820 % a.d.) 0,00',
        'E Total de encargos em R$ 322,47',
      ],
      '2026-09'
    );
    expect(result.encargos).toBe(322.47);
    // As linhas de encargos individuais não têm data — não viram "compra".
    expect(result.atual).toEqual([]);
  });

  it('encargos fica 0 quando a fatura não tem essa linha', () => {
    const result = parseFaturaPdfLines(['15/08 UI CREPE 48,00'], '2026-09');
    expect(result.encargos).toBe(0);
  });

  it('soma abatimentos/estornos (linhas de valor negativo na tabela de compras) em vez de simplesmente descartar', () => {
    const result = parseFaturaPdfLines(
      [
        '15/08 UI CREPE 48,00',
        '03/07 RAIA DROGASIL SA - 0,01',
        '11/07 LEGO FORTALEZA - 0,01',
        '17/07 PROPIG *I JO-CT E MELO - 0,02',
      ],
      '2026-09'
    );
    expect(result.atual).toHaveLength(1); // só a compra de verdade
    expect(result.abatimentos).toBeCloseTo(0.04);
  });

  it('não confunde "pagamento efetuado" da fatura anterior com abatimento pequeno', () => {
    const result = parseFaturaPdfLines(
      ['62053-745 SOBRAL - CE Pagamento efetuado em 07/08/2026 - 12.497,30'],
      '2026-09'
    );
    expect(result.abatimentos).toBe(0);
  });
});
