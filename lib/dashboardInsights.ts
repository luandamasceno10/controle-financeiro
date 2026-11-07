import type { Lancamento, Categoria } from './supabase';

export interface Insight {
  tipo: 'positiva' | 'negativa' | 'neutra';
  titulo: string;
  descricao: string;
  valor?: string;
  icone: 'trending-up' | 'trending-down' | 'info';
}

export function gerarInsights(
  lancamentosAtual: Lancamento[],
  lancamentosAnterior: Lancamento[],
  orcamentos: any[],
  categorias: Categoria[]
): Insight[] {
  const insights: Insight[] = [];

  // Cálculos do mês atual
  const saidaAtual = lancamentosAtual
    .filter(e => e.tipo === 'saida')
    .reduce((sum, e) => sum + Number(e.valor), 0);

  const entradaAtual = lancamentosAtual
    .filter(e => e.tipo === 'entrada')
    .reduce((sum, e) => sum + Number(e.valor), 0);

  // Cálculos do mês anterior
  const saidaAnterior = lancamentosAnterior
    .filter(e => e.tipo === 'saida')
    .reduce((sum, e) => sum + Number(e.valor), 0);

  const entradaAnterior = lancamentosAnterior
    .filter(e => e.tipo === 'entrada')
    .reduce((sum, e) => sum + Number(e.valor), 0);

  // Insight 1: Variação de despesas
  if (saidaAnterior > 0) {
    const variacao = ((saidaAtual - saidaAnterior) / saidaAnterior) * 100;
    if (variacao > 20) {
      insights.push({
        tipo: 'negativa',
        titulo: '⚠️ Gastos em alta',
        descricao: `Suas despesas aumentaram ${Math.round(variacao)}% comparado ao mês anterior.`,
        icone: 'trending-down',
      });
    } else if (variacao < -20) {
      insights.push({
        tipo: 'positiva',
        titulo: '🎉 Economia detectada',
        descricao: `Você gastou ${Math.round(Math.abs(variacao))}% menos que o mês passado!`,
        icone: 'trending-up',
      });
    }
  }

  // Insight 2: Maior categoria de gasto
  const categoriaGastos: Record<string, number> = {};
  lancamentosAtual
    .filter(e => e.tipo === 'saida')
    .forEach(e => {
      categoriaGastos[e.categoria] = (categoriaGastos[e.categoria] || 0) + Number(e.valor);
    });

  const maiorCategoria = Object.entries(categoriaGastos).sort(([, a], [, b]) => b - a)[0];
  if (maiorCategoria) {
    const percentual = ((maiorCategoria[1] / saidaAtual) * 100).toFixed(0);
    insights.push({
      tipo: 'neutra',
      titulo: `🏷️ Maior gasto: ${maiorCategoria[0]}`,
      descricao: `Representa ${percentual}% do total de despesas este mês.`,
      icone: 'info',
    });
  }

  // Insight 3: Orçamento
  const orcamentoTotal = orcamentos.reduce((sum, o) => sum + Number(o.limite), 0);
  if (orcamentoTotal > 0) {
    const percentualOrcamento = (saidaAtual / orcamentoTotal) * 100;
    if (percentualOrcamento > 100) {
      insights.push({
        tipo: 'negativa',
        titulo: '⚠️ Orçamento excedido',
        descricao: `Você ultrapassou o orçamento em ${Math.round(percentualOrcamento - 100)}%.`,
        icone: 'trending-down',
      });
    } else if (percentualOrcamento > 80) {
      insights.push({
        tipo: 'neutra',
        titulo: '📊 Orçamento em risco',
        descricao: `Você já utilizou ${Math.round(percentualOrcamento)}% do seu orçamento.`,
        icone: 'info',
      });
    } else if (percentualOrcamento < 50) {
      insights.push({
        tipo: 'positiva',
        titulo: '💚 Dentro do orçamento',
        descricao: `Você está em dia! Apenas ${Math.round(percentualOrcamento)}% do orçamento utilizado.`,
        icone: 'trending-up',
      });
    }
  }

  // Insight 4: Entradas vs Saídas
  const saldo = entradaAtual - saidaAtual;
  if (saldo > 0) {
    insights.push({
      tipo: 'positiva',
      titulo: '📈 Mês positivo',
      descricao: `Seu saldo é positivo. Você tem ${((saldo / entradaAtual) * 100).toFixed(0)}% de sobra.`,
      icone: 'trending-up',
    });
  } else if (saldo < 0) {
    insights.push({
      tipo: 'negativa',
      titulo: '📉 Déficit detectado',
      descricao: `Suas despesas superam as entradas. Cuidado com o saldo!`,
      icone: 'trending-down',
    });
  }

  return insights.slice(0, 4); // Retorna no máximo 4 insights
}
