import type { Lancamento, Categoria, OrcamentoCategoria, ContaPagar, CompraRecorrente } from './supabase';
import { isGastoFixo } from './gastoFixoVariavel';

export interface RelatorioCategoriaItem {
  name: string;
  value: number;
  count: number;
  icone?: string;
}

export interface RelatorioPixCartaoRow {
  name: string;
  pix: number;
  cartao: number;
  total: number;
  icone?: string;
}

export interface RelatorioOrcamentoRow {
  categoria: string;
  orcado: number;
  realizado: number;
  icone?: string;
}

export interface RelatorioDespesaFutura {
  descricao: string;
  valor: number;
  vencimento: string;
}

export interface RelatorioMensalData {
  entrada: number;
  saida: number;
  saldo: number;
  taxaPoupanca: number;
  custoVidaReal: number;
  entradasPorCategoria: RelatorioCategoriaItem[];
  fixos: RelatorioCategoriaItem[];
  variaveis: RelatorioCategoriaItem[];
  categoriaPixCartao: RelatorioPixCartaoRow[];
  orcamentoRows: RelatorioOrcamentoRow[];
  assinaturasAtivas: { descricao: string; valor: number }[];
  proximasDespesas: RelatorioDespesaFutura[];
}

function rollupNome(categorias: Categoria[], nome: string, tipo: 'entrada' | 'saida'): string {
  const cat = categorias.find((c) => c.tipo === tipo && c.nome === nome);
  if (cat?.parent_id) {
    const pai = categorias.find((c) => c.id === cat.parent_id);
    return pai?.nome || nome;
  }
  return nome;
}

// Única fonte de verdade pro relatório mensal — usada tanto pelo PDF gerado
// no navegador (aba Mensal do Dashboard) quanto pelo e-mail automático do
// dia 1 (gerado no servidor). Mantém os dois sempre com os mesmos números.
export function computeRelatorioMensal(params: {
  monthEntries: Lancamento[];
  categorias: Categoria[];
  orcamentos: OrcamentoCategoria[];
  comprasRecorrentes: CompraRecorrente[];
  proximasContasPagar: ContaPagar[];
}): RelatorioMensalData {
  const { monthEntries, categorias, orcamentos, comprasRecorrentes, proximasContasPagar } = params;

  const entrada = monthEntries.filter((e) => e.tipo === 'entrada').reduce((s, e) => s + Number(e.valor), 0);
  const saida = monthEntries.filter((e) => e.tipo === 'saida' && !e.cartao_id).reduce((s, e) => s + Number(e.valor), 0);
  const saldo = entrada - saida;
  const taxaPoupanca = entrada > 0 ? (saldo / entrada) * 100 : 0;

  const mapEntrada: Record<string, { value: number; count: number; icone?: string }> = {};
  monthEntries.filter((e) => e.tipo === 'entrada').forEach((e) => {
    const nome = rollupNome(categorias, e.categoria, e.tipo);
    if (!mapEntrada[nome]) mapEntrada[nome] = { value: 0, count: 0, icone: categorias.find((c) => c.tipo === 'entrada' && c.nome === nome)?.icone };
    mapEntrada[nome].value += Number(e.valor);
    mapEntrada[nome].count += 1;
  });
  const entradasPorCategoria = Object.entries(mapEntrada).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.value - a.value);

  const map: Record<string, { value: number; count: number; icone?: string }> = {};
  monthEntries.filter((e) => e.tipo === 'saida' && !e.cartao_id).forEach((e) => {
    const nome = rollupNome(categorias, e.categoria, e.tipo);
    if (!map[nome]) map[nome] = { value: 0, count: 0, icone: categorias.find((c) => c.tipo === 'saida' && c.nome === nome)?.icone };
    map[nome].value += Number(e.valor);
    map[nome].count += 1;
  });
  const categoryDataComContagem = Object.entries(map).map(([name, v]) => ({ name, ...v }));
  const fixos = categoryDataComContagem.filter((c) => isGastoFixo(c.name)).sort((a, b) => b.value - a.value);
  const variaveis = categoryDataComContagem.filter((c) => !isGastoFixo(c.name)).sort((a, b) => b.value - a.value);
  const custoVidaReal = fixos.reduce((s, c) => s + c.value, 0);

  const gastoPorCategoriaId: Record<number, number> = {};
  monthEntries.filter((e) => e.tipo === 'saida' && e.categoria_id && !e.cartao_id).forEach((e) => {
    gastoPorCategoriaId[e.categoria_id!] = (gastoPorCategoriaId[e.categoria_id!] || 0) + Number(e.valor);
  });
  const orcamentoRows = orcamentos
    .map((o) => {
      const filhas = categorias.filter((c) => c.parent_id === o.categoria_id).map((c) => c.id);
      const realizado = [o.categoria_id, ...filhas].reduce((s, id) => s + (gastoPorCategoriaId[id] || 0), 0);
      const cat = categorias.find((c) => c.id === o.categoria_id);
      return { categoria: cat?.nome || '—', orcado: Number(o.valor_limite), realizado, icone: cat?.icone };
    })
    .sort((a, b) => (b.realizado - b.orcado) - (a.realizado - a.orcado));

  const pixCartaoMap: Record<string, { pix: number; cartao: number; icone?: string }> = {};
  monthEntries.filter((e) => e.tipo === 'saida').forEach((e) => {
    const nome = rollupNome(categorias, e.categoria, e.tipo);
    if (!pixCartaoMap[nome]) pixCartaoMap[nome] = { pix: 0, cartao: 0, icone: categorias.find((c) => c.tipo === 'saida' && c.nome === nome)?.icone };
    pixCartaoMap[nome][e.forma_pagamento] += Number(e.valor);
  });
  const categoriaPixCartao = Object.entries(pixCartaoMap)
    .map(([name, v]) => ({ name, ...v, total: v.pix + v.cartao }))
    .sort((a, b) => b.total - a.total);

  const assinaturasAtivas = comprasRecorrentes.map((c) => ({ descricao: c.descricao, valor: Number(c.valor) }));
  const proximasDespesas = [...proximasContasPagar]
    .sort((a, b) => Number(b.valor) - Number(a.valor))
    .slice(0, 6)
    .map((p) => ({ descricao: p.descricao, valor: Number(p.valor), vencimento: p.vencimento }));

  return { entrada, saida, saldo, taxaPoupanca, custoVidaReal, entradasPorCategoria, fixos, variaveis, categoriaPixCartao, orcamentoRows, assinaturasAtivas, proximasDespesas };
}
