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

// A fatura é nomeada pelo mês em que fica devendo (vencimento), não pelo mês da
// compra: um cartão que fecha dia 30 cobra as compras de 01 a 30 de um mês na
// fatura do mês SEGUINTE (que é quando ela vence). Por isso o offset mínimo é 1
// mês (nunca 0) — só passa para 2 meses se a compra cair depois do dia de
// fechamento (aí ela entra no próximo ciclo de fechamento).
export function competenciaForPurchase(dataCompraISO: string, diaFechamento: number): string {
  const d = new Date(dataCompraISO + 'T00:00:00');
  const fechamentoEfetivo = clampDayToMonth(d.getFullYear(), d.getMonth(), diaFechamento);
  const offset = d.getDate() <= fechamentoEfetivo ? 1 : 2;
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftCompetencia(competencia: string, delta: number): string {
  const [y, m] = competencia.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function estimatedVencimento(cartao: CartaoCredito, competencia: string): string {
  const [y, m] = competencia.split('-').map(Number);
  const dia = clampDayToMonth(y, m - 1, cartao.dia_vencimento);
  return `${y}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
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
  const diaVencimentoEfetivo = clampDayToMonth(y, m - 1, cartao.dia_vencimento);
  const dataVencimento = new Date(y, m - 1, diaVencimentoEfetivo).toISOString().slice(0, 10);
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
