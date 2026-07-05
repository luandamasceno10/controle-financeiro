import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Tipos
export interface Lancamento {
  id: number;
  user_id: string;
  data: string;
  descricao: string;
  tipo: 'entrada' | 'saida';
  categoria: string;
  forma_pagamento: 'pix' | 'cartao';
  valor: number;
  created_at: string;
}

export interface ContaPagar {
  id: number;
  user_id: string;
  descricao: string;
  categoria: string;
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
export interface SaldoInicial {
  id: number;
  user_id: string;
  mes: string;
  saldo_inicial: number;
  created_at: string;
  updated_at: string;
}
