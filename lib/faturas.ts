import { supabase } from '@/lib/supabase';
import type { CartaoCredito, Fatura } from '@/lib/supabase';

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

// Cartões que fecham/vencem no dia 29, 30 ou 31 caem no último dia do mês
// quando esse mês é mais curto (ex: fechamento dia 31 em abril vira dia 30).
function clampDayToMonth(year: number, monthIndex: number, day: number): number {
  return Math.min(day, daysInMonth(year, monthIndex));
}

export function competenciaForPurchase(dataCompraISO: string, diaFechamento: number): string {
  const d = new Date(dataCompraISO + 'T00:00:00');
  const fechamentoEfetivo = clampDayToMonth(d.getFullYear(), d.getMonth(), diaFechamento);
  const offset = d.getDate() >= fechamentoEfetivo ? 1 : 0;
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
  // `competencia` é o mês em que a fatura fecha (ex: '2026-08' para fechamento
  // dia 30/ago). Quando o vencimento é antes do fechamento (o caso comum, ex:
  // fecha dia 30, vence dia 06), o vencimento cai no mês seguinte ao fechamento
  // — senão a fatura venceria antes mesmo de estar totalmente fechada.
  const mesVencimento = cartao.dia_vencimento < cartao.dia_fechamento ? m : m - 1;
  const diaVencimentoEfetivo = clampDayToMonth(y, mesVencimento, cartao.dia_vencimento);
  const dataVencimento = new Date(y, mesVencimento, diaVencimentoEfetivo).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('faturas')
    .insert([{ user_id: userId, cartao_id: cartao.id, competencia, data_vencimento: dataVencimento, status: 'aberta' }])
    .select()
    .single();
  if (error) {
    // Corrida: outra chamada criou a mesma fatura (cartao_id, competencia) entre o
    // select e o insert — reaproveita a que já existe em vez de propagar o erro.
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('faturas')
        .select('*')
        .eq('cartao_id', cartao.id)
        .eq('competencia', competencia)
        .single();
      if (retry) return retry;
    }
    throw error;
  }
  return data;
}
