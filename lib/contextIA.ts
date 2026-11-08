import { supabase } from '@/lib/supabase';
import type { Lancamento, OrcamentoCategoria, Meta, Categoria } from '@/lib/supabase';

export interface ContextoIA {
  mesAtual: string;
  lancamentosMes: Lancamento[];
  orcamentos: OrcamentoCategoria[];
  metas: Meta[];
  categorias: Categoria[];
  totalEntrada: number;
  totalSaida: number;
  saldoDisponivel: number;
  resumoCategories: Record<string, { total: number; limite?: number }>;
}

export async function getContextoIA(userId: string, mes: string): Promise<ContextoIA> {
  const [ano, mesNum] = mes.split('-');

  const [lancRes, orcRes, metRes, catRes] = await Promise.all([
    supabase
      .from('lancamentos')
      .select('*')
      .eq('user_id', userId)
      .like('data', `${ano}-${mesNum}-%`),
    supabase
      .from('orc_categoria')
      .select('*')
      .eq('user_id', userId),
    supabase
      .from('metas')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'ativa'),
    supabase
      .from('categorias')
      .select('*')
      .eq('user_id', userId)
      .eq('ativa', true),
  ]);

  const lancamentos = lancRes.data || [];
  const orcamentos = orcRes.data || [];
  const metas = metRes.data || [];
  const categorias = catRes.data || [];

  const totalEntrada = lancamentos
    .filter(l => l.tipo === 'entrada')
    .reduce((sum, l) => sum + Number(l.valor), 0);

  const totalSaida = lancamentos
    .filter(l => l.tipo === 'saida')
    .reduce((sum, l) => sum + Math.abs(Number(l.valor)), 0);

  // Resumo por categoria
  const resumoCategories: Record<string, { total: number; limite?: number }> = {};
  lancamentos.forEach(l => {
    if (!resumoCategories[l.categoria]) {
      resumoCategories[l.categoria] = { total: 0 };
    }
    if (l.tipo === 'saida') {
      resumoCategories[l.categoria].total += Math.abs(Number(l.valor));
    }
  });

  // Adicionar limites de orçamento
  orcamentos.forEach(orc => {
    const catName = categorias.find(c => c.id === orc.categoria_id)?.nome;
    if (catName && resumoCategories[catName]) {
      resumoCategories[catName].limite = Number(orc.valor_limite);
    }
  });

  return {
    mesAtual: mes,
    lancamentosMes: lancamentos,
    orcamentos,
    metas,
    categorias,
    totalEntrada,
    totalSaida,
    saldoDisponivel: totalEntrada - totalSaida,
    resumoCategories,
  };
}

export function montarPromptContexto(contexto: ContextoIA): string {
  const resumoStr = Object.entries(contexto.resumoCategories)
    .map(([cat, { total, limite }]) => {
      const pct = limite ? Math.round((total / limite) * 100) : 0;
      return `- ${cat}: R$ ${total.toFixed(2)}${limite ? ` (limite: R$ ${limite.toFixed(2)}, ${pct}%)` : ''}`;
    })
    .join('\n');

  return `
## Contexto Financeiro - ${contexto.mesAtual}

**Resumo do Mês:**
- Total de Entradas: R$ ${contexto.totalEntrada.toFixed(2)}
- Total de Saídas: R$ ${contexto.totalSaida.toFixed(2)}
- Saldo Disponível: R$ ${contexto.saldoDisponivel.toFixed(2)}

**Gastos por Categoria:**
${resumoStr}

**Metas Ativas:** ${contexto.metas.length} metas em progresso

Use essas informações para responder perguntas sobre gastos, identificar padrões e oferecer sugestões personalizadas.
Seja amigável, direto e prático. Se algo parecer fora do normal, avise o usuário.
`;
}
