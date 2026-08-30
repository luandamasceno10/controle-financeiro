import type { Categoria, Lancamento } from './supabase';

// Heurística por nome de categoria — usada só como último recurso, quando
// nem o lançamento nem a categoria têm uma classificação explícita. Tudo que
// não bater aqui conta como "variável" (estilo de vida), que é o padrão mais
// seguro pro objetivo do relatório: destacar onde há poder de corte.
const PALAVRAS_FIXO = [
  'moradia', 'aluguel', 'financiamento', 'condomínio', 'condominio',
  'dívida', 'divida', 'empréstimo', 'emprestimo', 'assinatura', 'mensalidade',
  'plano de saúde', 'plano de saude', 'seguro',
];

export function isGastoFixo(categoriaNome: string): boolean {
  const n = categoriaNome.toLowerCase();
  return PALAVRAS_FIXO.some((p) => n.includes(p));
}

// Prioridade: exceção pontual no lançamento > padrão definido na categoria >
// heurística por nome. O lançamento manda por último porque é o dado mais
// específico — é a exceção que o usuário escolheu abrir mão do padrão.
export function resolverTipoGasto(
  categoriaNome: string,
  categoria: Categoria | undefined,
  override?: Lancamento['tipo_gasto_override']
): 'fixo' | 'variavel' {
  if (override) return override;
  if (categoria?.tipo_gasto) return categoria.tipo_gasto;
  return isGastoFixo(categoriaNome) ? 'fixo' : 'variavel';
}
