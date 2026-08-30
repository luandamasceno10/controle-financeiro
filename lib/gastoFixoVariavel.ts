// Heurística por nome de categoria — o app não tem (ainda) um campo próprio
// pra marcar categorias como fixas, então classifica pelas palavras mais
// comuns de compromisso recorrente. Tudo que não bater aqui conta como
// "variável" (estilo de vida), que é o padrão mais seguro pro objetivo do
// relatório: destacar onde há poder de corte.
const PALAVRAS_FIXO = [
  'moradia', 'aluguel', 'financiamento', 'condomínio', 'condominio',
  'dívida', 'divida', 'empréstimo', 'emprestimo', 'assinatura', 'mensalidade',
  'plano de saúde', 'plano de saude', 'seguro',
];

export function isGastoFixo(categoriaNome: string): boolean {
  const n = categoriaNome.toLowerCase();
  return PALAVRAS_FIXO.some((p) => n.includes(p));
}
