import type { Lancamento, Categoria } from './supabase';
import { sumMoney } from './money';

// ============================================================
// Painel Executivo — DRE gerencial simplificada
// ============================================================
//
// Faturamento (receita)
// (−) Custos diretos: o que só existe porque houve venda — mercadoria/CMV,
//     peças, impostos sobre a venda, taxas de maquininha, comissões
// (=) Lucro bruto
// (−) Despesas operacionais: o que existe vendendo ou não — aluguel, folha,
//     marketing, sistemas, contador
// (=) Lucro líquido (operacional)
//
// "Fora do resultado" é dinheiro que se move mas não é receita nem gasto do
// negócio: pagamento de fatura (as compras já entram uma a uma), aporte,
// investimento, transferência entre contas, distribuição de lucro.

export type GrupoDRE = 'receita' | 'custo' | 'despesa' | 'fora';

export const GRUPO_LABEL: Record<GrupoDRE, string> = {
  receita: 'Receita (faturamento)',
  custo: 'Custo direto',
  despesa: 'Despesa operacional',
  fora: 'Fora do resultado',
};

const PALAVRAS_FORA = [
  'cartão de crédito', 'cartao de credito', 'transferência', 'transferencia',
  'investimento', 'aporte', 'rendimento', 'aplicação', 'aplicacao', 'resgate',
  'distribuição de lucro', 'distribuicao de lucro', 'empréstimo', 'emprestimo',
];

const PALAVRAS_CUSTO = [
  'cmv', 'mercadoria', 'estoque', 'fornecedor', 'peça', 'peca', 'insumo',
  'matéria-prima', 'materia-prima', 'imposto', 'simples nacional', ' das ',
  'taxa de cartão', 'taxa de cartao', 'maquininha', 'comissão', 'comissao',
  'frete de venda', 'embalagem',
];

function contemAlguma(nome: string, palavras: string[]) {
  const n = ` ${nome.toLowerCase()} `;
  return palavras.some((p) => n.includes(p));
}

// Heurística por nome — só vale enquanto o usuário não classificou a
// categoria explicitamente no painel.
export function grupoPadrao(nome: string, tipo: 'entrada' | 'saida'): GrupoDRE {
  if (contemAlguma(nome, PALAVRAS_FORA)) return 'fora';
  if (tipo === 'entrada') return 'receita';
  if (contemAlguma(nome, PALAVRAS_CUSTO)) return 'custo';
  return 'despesa';
}

// Prioridade: classificação da própria categoria > classificação da
// categoria-pai > heurística por nome. "Cartão de crédito" é sempre fora: é o
// pagamento da fatura, e as compras do cartão já entram individualmente —
// contar os dois duplicaria o gasto (mesma regra de lib/relatorioCalculos.ts).
export function resolverGrupo(nome: string, tipo: 'entrada' | 'saida', categorias: Categoria[]): GrupoDRE {
  if (nome === 'Cartão de crédito') return 'fora';
  const cat = categorias.find((c) => c.tipo === tipo && c.nome === nome);
  const pai = cat?.parent_id ? categorias.find((c) => c.id === cat.parent_id) : null;
  const grupo = cat?.grupo_dre || pai?.grupo_dre || grupoPadrao(nome, tipo);
  // Uma saída nunca é receita e uma entrada nunca é custo/despesa — se a
  // heurística ou a classificação disserem isso, cai no lado neutro.
  if (tipo === 'saida' && grupo === 'receita') return 'despesa';
  if (tipo === 'entrada' && (grupo === 'custo' || grupo === 'despesa')) return 'receita';
  return grupo;
}

export interface LinhaDRE {
  nome: string;
  valor: number;
}

export interface ResultadoDRE {
  faturamento: number;
  custos: number;
  lucroBruto: number;
  despesas: number;
  lucro: number;
  margemBruta: number | null;
  margemLiquida: number | null;
  // Faturamento que zera o lucro mantendo a margem bruta atual.
  pontoEquilibrio: number | null;
  receitas: LinhaDRE[];
  custosPorCategoria: LinhaDRE[];
  despesasPorCategoria: LinhaDRE[];
  numVendas: number;
  ticketMedio: number | null;
}

function agrupar(entries: Lancamento[], categorias: Categoria[]): LinhaDRE[] {
  const map: Record<string, number[]> = {};
  entries.forEach((e) => {
    const cat = categorias.find((c) => c.tipo === e.tipo && c.nome === e.categoria);
    const pai = cat?.parent_id ? categorias.find((c) => c.id === cat.parent_id) : null;
    const nome = pai?.nome || e.categoria;
    (map[nome] ||= []).push(Number(e.valor));
  });
  return Object.entries(map)
    .map(([nome, valores]) => ({ nome, valor: sumMoney(valores) }))
    .sort((a, b) => b.valor - a.valor);
}

export function computeDRE(entries: Lancamento[], categorias: Categoria[]): ResultadoDRE {
  const porGrupo: Record<GrupoDRE, Lancamento[]> = { receita: [], custo: [], despesa: [], fora: [] };
  entries.forEach((e) => porGrupo[resolverGrupo(e.categoria, e.tipo, categorias)].push(e));

  // Estorno/devolução lançado como entrada em categoria de custo/despesa não
  // existe aqui (entrada nunca vira custo), então cada grupo é só soma.
  const faturamento = sumMoney(porGrupo.receita.map((e) => Number(e.valor)));
  const custos = sumMoney(porGrupo.custo.map((e) => Number(e.valor)));
  const despesas = sumMoney(porGrupo.despesa.map((e) => Number(e.valor)));
  const lucroBruto = sumMoney([faturamento, -custos]);
  const lucro = sumMoney([lucroBruto, -despesas]);

  const margemBruta = faturamento > 0 ? (lucroBruto / faturamento) * 100 : null;
  const margemLiquida = faturamento > 0 ? (lucro / faturamento) * 100 : null;
  const pontoEquilibrio = margemBruta !== null && margemBruta > 0 ? despesas / (margemBruta / 100) : null;
  const numVendas = porGrupo.receita.length;

  return {
    faturamento, custos, lucroBruto, despesas, lucro, margemBruta, margemLiquida, pontoEquilibrio,
    receitas: agrupar(porGrupo.receita, categorias),
    custosPorCategoria: agrupar(porGrupo.custo, categorias),
    despesasPorCategoria: agrupar(porGrupo.despesa, categorias),
    numVendas,
    ticketMedio: numVendas > 0 ? faturamento / numVendas : null,
  };
}

// ============================================================
// Metas
// ============================================================

export interface MetaExecutiva {
  id?: number;
  user_id?: string;
  mes: string; // YYYY-MM
  meta_faturamento: number | null;
  meta_lucro: number | null;
  meta_margem: number | null;
}

// Meta definida num mês vale para os seguintes até ser trocada — ninguém
// redigita a mesma meta todo mês. Retorna de qual mês ela veio.
export function resolverMeta(metas: MetaExecutiva[], mes: string): { meta: MetaExecutiva | null; herdadaDe: string | null } {
  const candidatas = metas.filter((m) => m.mes <= mes).sort((a, b) => b.mes.localeCompare(a.mes));
  const meta = candidatas[0] || null;
  return { meta, herdadaDe: meta && meta.mes !== mes ? meta.mes : null };
}

// ============================================================
// Calendário do mês e projeção de fechamento
// ============================================================

export function diasNoMes(mes: string): number {
  const [ano, m] = mes.split('-').map(Number);
  return new Date(ano, m, 0).getDate();
}

export function shiftMes(mes: string, delta: number): string {
  const [ano, m] = mes.split('-').map(Number);
  const d = new Date(ano, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export type StatusMes = 'passado' | 'corrente' | 'futuro';

export function statusMes(mes: string, hojeISO: string): StatusMes {
  const atual = hojeISO.slice(0, 7);
  if (mes < atual) return 'passado';
  if (mes > atual) return 'futuro';
  return 'corrente';
}

export interface Projecao {
  status: StatusMes;
  diaAtual: number;
  totalDias: number;
  diasRestantes: number;
  faturamento: number;
  despesas: number;
  custos: number;
  lucro: number;
  margem: number | null;
}

export interface HistoricoMes {
  faturamento: number;
  custos: number;
  despesas: number;
}

// Faturamento acompanha a venda, então projeta linear pelo ritmo do mês.
// Custo direto também acompanha, mas parte dele cai de uma vez (o DAS sai
// dia 20, a compra de estoque é semanal): no começo do mês o custo linear
// sai baixo demais. Por isso usa o maior entre o linear e o % de custo
// histórico aplicado ao faturamento projetado — erra para o lado prudente.
// Despesa operacional não acompanha a venda: aluguel e folha caem de uma vez
// — usa o maior entre o realizado e a média dos meses fechados anteriores.
export function projetarFechamento(
  dre: ResultadoDRE,
  mes: string,
  hojeISO: string,
  mesesAnteriores: HistoricoMes[],
): Projecao {
  const status = statusMes(mes, hojeISO);
  const totalDias = diasNoMes(mes);
  const diaAtual = status === 'corrente' ? Number(hojeISO.slice(8, 10)) : status === 'passado' ? totalDias : 0;
  const diasRestantes = totalDias - diaAtual;

  if (status !== 'corrente' || diaAtual === 0) {
    return { status, diaAtual, totalDias, diasRestantes, faturamento: dre.faturamento, custos: dre.custos, despesas: dre.despesas, lucro: dre.lucro, margem: dre.margemLiquida };
  }

  const fator = totalDias / diaAtual;
  const faturamento = dre.faturamento * fator;
  const comVenda = mesesAnteriores.filter((m) => m.faturamento > 0);
  const pctCustoHistorico = comVenda.length > 0
    ? comVenda.reduce((s, m) => s + m.custos, 0) / comVenda.reduce((s, m) => s + m.faturamento, 0)
    : 0;
  const custos = Math.max(dre.custos * fator, faturamento * pctCustoHistorico);
  const historico = mesesAnteriores.map((m) => m.despesas).filter((v) => v > 0);
  const mediaDespesas = historico.length > 0 ? historico.reduce((s, v) => s + v, 0) / historico.length : dre.despesas * fator;
  const despesas = Math.max(dre.despesas, mediaDespesas);
  const lucro = faturamento - custos - despesas;
  const margem = faturamento > 0 ? (lucro / faturamento) * 100 : null;
  return { status, diaAtual, totalDias, diasRestantes, faturamento, custos, despesas, lucro, margem };
}

// Quanto precisa entrar por dia, daqui até o fim do mês, para bater a meta.
export function ritmoNecessarioDiario(meta: number, realizado: number, diasRestantes: number): number {
  const falta = Math.max(0, meta - realizado);
  return falta / Math.max(1, diasRestantes);
}

// Lançamentos do mês anterior só até o mesmo dia do mês — comparar um mês
// em andamento com o mês anterior inteiro faz todo dia 5 parecer uma queda.
export function filtrarAteDia(entries: Lancamento[], dia: number): Lancamento[] {
  return entries.filter((e) => Number(e.data.slice(8, 10)) <= dia);
}

// ============================================================
// Alertas do conselheiro — leitura automática dos números
// ============================================================

export type NivelAlerta = 'bom' | 'atencao' | 'critico';

export interface Alerta {
  nivel: NivelAlerta;
  titulo: string;
  detalhe: string;
}

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function pp(v: number) {
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.`;
}

export function gerarAlertas(params: {
  atual: ResultadoDRE;
  anterior: ResultadoDRE;
  projecao: Projecao;
  meta: MetaExecutiva | null;
}): Alerta[] {
  const { atual, anterior, projecao, meta } = params;
  const alertas: Alerta[] = [];
  if (atual.faturamento === 0 && atual.custos === 0 && atual.despesas === 0) return alertas;

  const emAndamento = projecao.status === 'corrente';
  const lucroRef = emAndamento ? projecao.lucro : atual.lucro;

  if (lucroRef < 0) {
    alertas.push({
      nivel: 'critico',
      titulo: emAndamento ? 'Mês caminha para prejuízo' : 'Mês fechou no prejuízo',
      detalhe: atual.pontoEquilibrio !== null
        ? `Ponto de equilíbrio: ${brl(atual.pontoEquilibrio)} de faturamento com a margem bruta atual. ${emAndamento ? `Projeção hoje: ${brl(projecao.faturamento)}.` : `Faturado: ${brl(atual.faturamento)}.`}`
        : 'A margem bruta está zerada ou negativa: revise preço de venda e custo de aquisição antes de qualquer outra coisa.',
    });
  }

  if (meta?.meta_faturamento) {
    const ref = emAndamento ? projecao.faturamento : atual.faturamento;
    const pct = (ref / meta.meta_faturamento) * 100;
    if (pct >= 100) {
      alertas.push({ nivel: 'bom', titulo: emAndamento ? 'No ritmo para bater a meta de faturamento' : 'Meta de faturamento batida', detalhe: `${emAndamento ? 'Projeção' : 'Realizado'}: ${brl(ref)} (${Math.round(pct)}% da meta).` });
    } else if (emAndamento) {
      const ritmo = ritmoNecessarioDiario(meta.meta_faturamento, atual.faturamento, projecao.diasRestantes);
      const ritmoAtual = projecao.diaAtual > 0 ? atual.faturamento / projecao.diaAtual : 0;
      alertas.push({
        nivel: pct < 85 ? 'critico' : 'atencao',
        titulo: `Projeção em ${Math.round(pct)}% da meta de faturamento`,
        detalhe: `Para bater ${brl(meta.meta_faturamento)} faltam ${brl(meta.meta_faturamento - atual.faturamento)}: ${brl(ritmo)}/dia nos próximos ${projecao.diasRestantes} dias (ritmo atual: ${brl(ritmoAtual)}/dia).`,
      });
    } else {
      alertas.push({ nivel: pct < 85 ? 'critico' : 'atencao', titulo: `Fechou em ${Math.round(pct)}% da meta de faturamento`, detalhe: `Faltaram ${brl(meta.meta_faturamento - atual.faturamento)}.` });
    }
  }

  if (meta?.meta_margem != null) {
    const margemRef = emAndamento ? projecao.margem : atual.margemLiquida;
    if (margemRef !== null && margemRef < meta.meta_margem) {
      alertas.push({
        nivel: 'atencao',
        titulo: 'Margem líquida abaixo da meta',
        detalhe: `${margemRef.toFixed(1)}% contra meta de ${meta.meta_margem}%. Cada ponto de margem vale ${brl(atual.faturamento / 100)} no faturamento atual.`,
      });
    }
  }

  if (atual.margemBruta !== null && anterior.margemBruta !== null) {
    const delta = atual.margemBruta - anterior.margemBruta;
    if (delta <= -3) {
      alertas.push({
        nivel: 'atencao',
        titulo: `Margem bruta caiu ${pp(Math.abs(delta))}`,
        detalhe: 'Custo direto subiu mais que a venda: desconto excessivo, mix puxado para produto de margem baixa ou fornecedor mais caro. Confira os maiores custos abaixo.',
      });
    } else if (delta >= 3) {
      alertas.push({ nivel: 'bom', titulo: `Margem bruta subiu ${pp(delta)}`, detalhe: 'Venda está deixando mais dinheiro por real faturado que no mesmo período do mês anterior.' });
    }
  }

  // Despesa que mais cresceu — só reporta se o salto for relevante em valor
  // absoluto (2% do faturamento), senão vira ruído.
  const limiar = Math.max(200, atual.faturamento * 0.02);
  const saltos = atual.despesasPorCategoria
    .map((d) => {
      const antes = anterior.despesasPorCategoria.find((a) => a.nome === d.nome)?.valor || 0;
      return { nome: d.nome, atual: d.valor, antes, delta: d.valor - antes };
    })
    .filter((d) => d.delta >= limiar && (d.antes === 0 || d.delta / d.antes >= 0.3))
    .sort((a, b) => b.delta - a.delta);
  if (saltos[0]) {
    const s = saltos[0];
    alertas.push({
      nivel: 'atencao',
      titulo: `Despesa com ${s.nome} cresceu ${brl(s.delta)}`,
      detalhe: s.antes > 0 ? `De ${brl(s.antes)} para ${brl(s.atual)} no mesmo período (+${Math.round((s.delta / s.antes) * 100)}%).` : `${brl(s.atual)} neste período, sem gasto no mesmo período do mês anterior.`,
    });
  }

  const ordem: Record<NivelAlerta, number> = { critico: 0, atencao: 1, bom: 2 };
  return alertas.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}
