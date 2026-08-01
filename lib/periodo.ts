import type { PeriodoRepeticao } from '@/lib/supabase';

export function addByPeriodo(dataISO: string, periodo: PeriodoRepeticao): string {
  const d = new Date(dataISO + 'T00:00:00');
  if (periodo === 'semanal') d.setDate(d.getDate() + 7);
  else if (periodo === 'quinzenal') d.setDate(d.getDate() + 15);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export const PERIODO_LABEL: Record<PeriodoRepeticao, string> = {
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  mensal: 'Mensal',
};
