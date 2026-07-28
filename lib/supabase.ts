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
  valor: number;
  created_at: string;
}

export interface ContaPagar {
  id: number;
  user_id: string;
  descricao: string;
  categoria: string;
  categoria_id: number | null;
  valor: number;
  vencimento: string;
  status: 'pendente' | 'pago';
  recorrente: boolean;
  created_at: string;
}

export interface ContaReceber {
  id: number;
  user_id: string;
  descricao: string;
  valor: number;
  vencimento: string;
  status: 'pendente' | 'recebido';
  recorrente: boolean;
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
