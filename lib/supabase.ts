import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Tipos
export interface Lancamento {
  id: number;
  user_id: string;
  data: string;
  hora: string | null;
  descricao: string;
  tipo: 'entrada' | 'saida';
  categoria: string;
  categoria_id: number | null;
  forma_pagamento: 'pix' | 'cartao';
  conta_id: number | null;
  cartao_id: number | null;
  fatura_id: number | null;
  recorrente_id: number | null;
  valor: number;
  created_at: string;
}

export type TipoRepeticao = 'nenhuma' | 'recorrente' | 'parcelado';
export type PeriodoRepeticao = 'semanal' | 'quinzenal' | 'mensal';

export interface ContaPagar {
  id: number;
  user_id: string;
  descricao: string;
  categoria: string;
  categoria_id: number | null;
  valor: number;
  vencimento: string;
  status: 'pendente' | 'pago';
  tipo_repeticao: TipoRepeticao;
  periodo: PeriodoRepeticao;
  parcela_atual: number | null;
  parcela_total: number | null;
  created_at: string;
}

export interface ContaReceber {
  id: number;
  user_id: string;
  descricao: string;
  valor: number;
  vencimento: string;
  status: 'pendente' | 'recebido';
  tipo_repeticao: TipoRepeticao;
  periodo: PeriodoRepeticao;
  parcela_atual: number | null;
  parcela_total: number | null;
  created_at: string;
}

export interface Previsao {
  id: number;
  user_id: string;
  mes: string;
  valor_previsto: number;
  created_at: string;
}

export interface Categoria {
  id: number;
  user_id: string;
  nome: string;
  tipo: 'entrada' | 'saida';
  cor: string;
  icone: string;
  emoji: string | null;
  ativa: boolean;
  ordem: number;
  created_at: string;
}

export interface ContaBancaria {
  id: number;
  user_id: string;
  nome: string;
  banco: string | null;
  saldo_inicial: number;
  cor: string;
  ativa: boolean;
  created_at: string;
}

export interface AnaliseIA {
  id: number;
  user_id: string;
  data: string;
  mes_referencia: string | null;
  texto: string;
  created_at: string;
}

export interface CartaoCredito {
  id: number;
  user_id: string;
  nome: string;
  banco: string | null;
  cor: string;
  dia_fechamento: number;
  dia_vencimento: number;
  ativo: boolean;
  created_at: string;
}

export interface Fatura {
  id: number;
  user_id: string;
  cartao_id: number;
  competencia: string;
  data_vencimento: string;
  status: 'aberta' | 'paga';
  created_at: string;
}

export interface Meta {
  id: number;
  user_id: string;
  nome: string;
  valor_alvo: number;
  data_alvo: string | null;
  cor: string;
  status: 'ativa' | 'concluida' | 'arquivada';
  created_at: string;
}

export interface MetaContribuicao {
  id: number;
  meta_id: number;
  user_id: string;
  valor: number;
  data: string;
  nota: string | null;
  lancamento_id: number | null;
  created_at: string;
}

export interface LancamentoRecorrente {
  id: number;
  user_id: string;
  descricao: string;
  tipo: 'entrada' | 'saida';
  categoria: string;
  categoria_id: number | null;
  forma_pagamento: 'pix' | 'cartao';
  conta_id: number | null;
  cartao_id: number | null;
  valor: number;
  dia_mes: number;
  ativo: boolean;
  data_inicio: string;
  data_fim: string | null;
  ultima_geracao: string | null;
  created_at: string;
}

export interface OrcamentoCategoria {
  id: number;
  user_id: string;
  categoria_id: number;
  valor_limite: number;
  created_at: string;
}
