import { supabase } from '@/lib/supabase';
import type { CartaoCredito, Fatura } from '@/lib/supabase';

export function competenciaForPurchase(dataCompraISO: string, diaFechamento: number): string {
  const d = new Date(dataCompraISO + 'T00:00:00');
  const offset = d.getDate() >= diaFechamento ? 1 : 0;
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function ensureFatura(cartao: CartaoCredito, competencia: string, userId: string): Promise<Fatura> {
  const { data: existing } = await supabase
    .from('faturas')
    .select('*')
    .eq('cartao_id', cartao.id)
    .eq('competencia', competencia)
    .maybeSingle();
  if (existing) return existing;

  const [y, m] = competencia.split('-').map(Number);
  const dataVencimento = new Date(y, m - 1, cartao.dia_vencimento).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('faturas')
    .insert([{ user_id: userId, cartao_id: cartao.id, competencia, data_vencimento: dataVencimento, status: 'aberta' }])
    .select()
    .single();
  if (error) throw error;
  return data;
}
