import { describe, it, expect } from 'vitest';
import {
  grupoPadrao, resolverGrupo, computeDRE, resolverMeta, projetarFechamento,
  ritmoNecessarioDiario, filtrarAteDia, shiftMes, diasNoMes, gerarAlertas,
} from './executivo';
import type { Categoria, Lancamento } from './supabase';

function cat(id: number, nome: string, tipo: 'entrada' | 'saida', extra: Partial<Categoria> = {}): Categoria {
  return { id, user_id: 'u', nome, tipo, cor: '#000', icone: 'Home', emoji: null, ativa: true, ordem: 0, parent_id: null, created_at: '', ...extra } as Categoria;
}

let nextId = 1;
function lanc(tipo: 'entrada' | 'saida', categoria: string, valor: number, data = '2026-10-02'): Lancamento {
  return { id: nextId++, tipo, categoria, valor, data } as Lancamento;
}

describe('grupoPadrao', () => {
  it('entrada vira receita, saída vira despesa por padrão', () => {
    expect(grupoPadrao('Vendas loja', 'entrada')).toBe('receita');
    expect(grupoPadrao('Aluguel', 'saida')).toBe('despesa');
  });

  it('reconhece custo direto pelo nome', () => {
    expect(grupoPadrao('Compra de mercadoria', 'saida')).toBe('custo');
    expect(grupoPadrao('Taxa de cartão', 'saida')).toBe('custo');
    expect(grupoPadrao('DAS', 'saida')).toBe('custo');
  });

  it('não confunde "das" dentro de outra palavra', () => {
    expect(grupoPadrao('Vendas', 'entrada')).toBe('receita');
    expect(grupoPadrao('Saídas diversas', 'saida')).toBe('despesa');
  });

  it('movimentação financeira fica fora do resultado', () => {
    expect(grupoPadrao('Cartão de crédito', 'saida')).toBe('fora');
    expect(grupoPadrao('Investimentos', 'entrada')).toBe('fora');
    expect(grupoPadrao('Transferência entre contas', 'saida')).toBe('fora');
  });
});

describe('resolverGrupo', () => {
  it('classificação explícita vence a heurística', () => {
    const cats = [cat(1, 'Aluguel', 'saida', { grupo_dre: 'custo' })];
    expect(resolverGrupo('Aluguel', 'saida', cats)).toBe('custo');
  });

  it('subcategoria herda a classificação do pai', () => {
    const cats = [cat(1, 'Estoque', 'saida', { grupo_dre: 'custo' }), cat(2, 'Smartphones', 'saida', { parent_id: 1 })];
    expect(resolverGrupo('Smartphones', 'saida', cats)).toBe('custo');
  });

  it('pagamento de fatura é sempre fora, mesmo se classificado', () => {
    const cats = [cat(1, 'Cartão de crédito', 'saida', { grupo_dre: 'despesa' })];
    expect(resolverGrupo('Cartão de crédito', 'saida', cats)).toBe('fora');
  });

  it('saída nunca vira receita', () => {
    const cats = [cat(1, 'X', 'saida', { grupo_dre: 'receita' })];
    expect(resolverGrupo('X', 'saida', cats)).toBe('despesa');
  });
});

describe('computeDRE', () => {
  const cats = [
    cat(1, 'Vendas', 'entrada'),
    cat(2, 'Mercadoria', 'saida'),
    cat(3, 'Aluguel', 'saida'),
    cat(4, 'Cartão de crédito', 'saida'),
  ];

  it('monta faturamento, lucro bruto, lucro e margens', () => {
    const dre = computeDRE([
      lanc('entrada', 'Vendas', 6000),
      lanc('entrada', 'Vendas', 4000),
      lanc('saida', 'Mercadoria', 6000),
      lanc('saida', 'Aluguel', 2500),
      lanc('saida', 'Cartão de crédito', 9999),
    ], cats);
    expect(dre.faturamento).toBe(10000);
    expect(dre.custos).toBe(6000);
    expect(dre.lucroBruto).toBe(4000);
    expect(dre.despesas).toBe(2500);
    expect(dre.lucro).toBe(1500);
    expect(dre.margemBruta).toBe(40);
    expect(dre.margemLiquida).toBe(15);
    expect(dre.pontoEquilibrio).toBe(6250);
    expect(dre.numVendas).toBe(2);
    expect(dre.ticketMedio).toBe(5000);
  });

  it('sem faturamento, margens ficam nulas (não 0% nem infinito)', () => {
    const dre = computeDRE([lanc('saida', 'Aluguel', 100)], cats);
    expect(dre.margemLiquida).toBeNull();
    expect(dre.pontoEquilibrio).toBeNull();
    expect(dre.lucro).toBe(-100);
  });

  it('soma em centavos, sem erro de ponto flutuante', () => {
    const dre = computeDRE([lanc('entrada', 'Vendas', 0.1), lanc('entrada', 'Vendas', 0.2)], cats);
    expect(dre.faturamento).toBe(0.3);
  });
});

describe('resolverMeta', () => {
  const metas = [
    { mes: '2026-01', meta_faturamento: 50000, meta_lucro: null, meta_margem: null },
    { mes: '2026-08', meta_faturamento: 80000, meta_lucro: 12000, meta_margem: 15 },
  ];

  it('usa a meta do próprio mês', () => {
    expect(resolverMeta(metas, '2026-08')).toEqual({ meta: metas[1], herdadaDe: null });
  });

  it('herda a meta mais recente anterior', () => {
    expect(resolverMeta(metas, '2026-10')).toEqual({ meta: metas[1], herdadaDe: '2026-08' });
    expect(resolverMeta(metas, '2026-05').meta?.meta_faturamento).toBe(50000);
  });

  it('sem meta anterior, retorna nulo', () => {
    expect(resolverMeta(metas, '2025-12').meta).toBeNull();
  });
});

describe('calendário', () => {
  it('diasNoMes e shiftMes atravessam ano e fevereiro', () => {
    expect(diasNoMes('2026-02')).toBe(28);
    expect(diasNoMes('2028-02')).toBe(29);
    expect(shiftMes('2026-01', -1)).toBe('2025-12');
    expect(shiftMes('2026-12', 1)).toBe('2027-01');
  });

  it('filtrarAteDia compara mesmo período', () => {
    const r = filtrarAteDia([lanc('entrada', 'Vendas', 1, '2026-09-03'), lanc('entrada', 'Vendas', 1, '2026-09-20')], 4);
    expect(r).toHaveLength(1);
  });
});

describe('projetarFechamento', () => {
  const cats = [cat(1, 'Vendas', 'entrada'), cat(2, 'Mercadoria', 'saida'), cat(3, 'Aluguel', 'saida')];

  it('projeta venda linear e despesa pela média histórica', () => {
    // dia 10 de 30: R$ 10 mil vendidos → R$ 30 mil projetados
    const dre = computeDRE([lanc('entrada', 'Vendas', 10000), lanc('saida', 'Mercadoria', 6000), lanc('saida', 'Aluguel', 3000)], cats);
    const p = projetarFechamento(dre, '2026-09', '2026-09-10', [{ faturamento: 0, custos: 0, despesas: 5000 }, { faturamento: 0, custos: 0, despesas: 7000 }]);
    expect(p.status).toBe('corrente');
    expect(p.faturamento).toBe(30000);
    expect(p.custos).toBe(18000);
    expect(p.despesas).toBe(6000);
    expect(p.lucro).toBe(6000);
    expect(p.margem).toBe(20);
    expect(p.diasRestantes).toBe(20);
  });

  it('despesa realizada acima da média não é reduzida', () => {
    const dre = computeDRE([lanc('entrada', 'Vendas', 10000), lanc('saida', 'Aluguel', 9000)], cats);
    expect(projetarFechamento(dre, '2026-09', '2026-09-10', [{ faturamento: 0, custos: 0, despesas: 5000 }]).despesas).toBe(9000);
  });

  it('custo que ainda não caiu no mês usa o % histórico', () => {
    // dia 10: vendeu 10 mil, custo só 2 mil até agora (DAS ainda não saiu);
    // histórico: custo = 60% do faturamento → 18 mil, não 6 mil.
    const dre = computeDRE([lanc('entrada', 'Vendas', 10000), lanc('saida', 'Mercadoria', 2000)], cats);
    const p = projetarFechamento(dre, '2026-09', '2026-09-10', [{ faturamento: 50000, custos: 30000, despesas: 0 }]);
    expect(p.custos).toBe(18000);
  });

  it('mês fechado não projeta', () => {
    const dre = computeDRE([lanc('entrada', 'Vendas', 10000)], cats);
    const p = projetarFechamento(dre, '2026-08', '2026-09-10', []);
    expect(p.status).toBe('passado');
    expect(p.faturamento).toBe(10000);
    expect(p.diasRestantes).toBe(0);
  });
});

describe('ritmoNecessarioDiario', () => {
  it('divide o que falta pelos dias restantes', () => {
    expect(ritmoNecessarioDiario(30000, 10000, 20)).toBe(1000);
  });
  it('meta já batida → zero; último dia não divide por zero', () => {
    expect(ritmoNecessarioDiario(100, 200, 5)).toBe(0);
    expect(ritmoNecessarioDiario(100, 50, 0)).toBe(50);
  });
});

describe('gerarAlertas', () => {
  const cats = [cat(1, 'Vendas', 'entrada'), cat(2, 'Mercadoria', 'saida'), cat(3, 'Aluguel', 'saida'), cat(4, 'Marketing', 'saida')];

  it('aponta prejuízo como crítico e primeiro da lista', () => {
    const atual = computeDRE([lanc('entrada', 'Vendas', 1000), lanc('saida', 'Mercadoria', 600), lanc('saida', 'Aluguel', 900)], cats);
    const anterior = computeDRE([], cats);
    const alertas = gerarAlertas({ atual, anterior, projecao: projetarFechamento(atual, '2026-08', '2026-09-10', []), meta: { mes: '2026-08', meta_faturamento: 5000, meta_lucro: null, meta_margem: null } });
    expect(alertas[0].nivel).toBe('critico');
    expect(alertas[0].titulo).toContain('prejuízo');
  });

  it('detecta salto de despesa relevante', () => {
    const anterior = computeDRE([lanc('entrada', 'Vendas', 20000), lanc('saida', 'Marketing', 1000)], cats);
    const atual = computeDRE([lanc('entrada', 'Vendas', 20000), lanc('saida', 'Marketing', 3000)], cats);
    const alertas = gerarAlertas({ atual, anterior, projecao: projetarFechamento(atual, '2026-08', '2026-09-10', []), meta: null });
    expect(alertas.some((a) => a.titulo.includes('Marketing'))).toBe(true);
  });

  it('sem movimento, sem alerta', () => {
    const vazio = computeDRE([], cats);
    expect(gerarAlertas({ atual: vazio, anterior: vazio, projecao: projetarFechamento(vazio, '2026-08', '2026-09-10', []), meta: null })).toEqual([]);
  });
});
