import type { Lancamento } from './supabase';

// Heurística por nome de categoria — usada só como fallback, quando o
// lançamento não tem uma classificação explícita. Tudo que não bater aqui
// conta como "variável" (estilo de vida), que é o padrão mais seguro pro
// objetivo do relatório: destacar onde há poder de corte.
const PALAVRAS_FIXO = [
  'moradia', 'aluguel', 'financiamento', 'condomínio', 'condominio',
  'dívida', 'divida', 'empréstimo', 'emprestimo', 'assinatura', 'mensalidade',
  'plano de saúde', 'plano de saude', 'seguro',
];

export function isGastoFixo(categoriaNome: string): boolean {
  const n = categoriaNome.toLowerCase();
  return PALAVRAS_FIXO.some((p) => n.includes(p));
}

// Prioridade: classificação escolhida no próprio lançamento > heurística por
// nome da categoria. Fixo/variável é uma característica do lançamento, não
// da categoria — a mesma categoria pode ter gastos dos dois tipos.
export function resolverTipoGasto(categoriaNome: string, override?: Lancamento['tipo_gasto_override']): 'fixo' | 'variavel' {
  if (override) return override;
  return isGastoFixo(categoriaNome) ? 'fixo' : 'variavel';
}
