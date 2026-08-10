import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { competenciaForPurchase } from '@/lib/faturas';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

async function ensureFaturaServer(supabase: any, userId: string, cartao: any, competencia: string) {
  const { data: existing } = await supabase.from('faturas').select('*').eq('cartao_id', cartao.id).eq('competencia', competencia).maybeSingle();
  if (existing) return existing;
  const [y, m] = competencia.split('-').map(Number);
  const dia = Math.min(cartao.dia_vencimento, daysInMonth(y, m - 1));
  const dataVencimento = new Date(y, m - 1, dia).toISOString().slice(0, 10);
  const { data, error } = await supabase.from('faturas').insert([{ user_id: userId, cartao_id: cartao.id, competencia, data_vencimento: dataVencimento, status: 'aberta' }]).select().single();
  if (error) {
    if (error.code === '23505') {
      const { data: retry } = await supabase.from('faturas').select('*').eq('cartao_id', cartao.id).eq('competencia', competencia).single();
      if (retry) return retry;
    }
    throw error;
  }
  return data;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const hojeISO = todayISO();

  const { data: compras } = await supabase.from('compras_recorrentes').select('*, cartoes_credito(*)').eq('ativa', true);
  if (!compras || compras.length === 0) return NextResponse.json({ geradas: 0 });

  let geradas = 0;
  for (const compra of compras) {
    const cartao = compra.cartoes_credito;
    if (!cartao || !cartao.ativo) continue;

    const competenciaAtual = competenciaForPurchase(hojeISO, cartao.dia_fechamento);
    if (compra.ultima_competencia === competenciaAtual) continue;

    try {
      const fatura = await ensureFaturaServer(supabase, compra.user_id, cartao, competenciaAtual);
      const { error: lancError } = await supabase.from('lancamentos').insert([{
        user_id: compra.user_id,
        data: hojeISO,
        hora: nowTime(),
        descricao: compra.descricao,
        tipo: 'saida',
        categoria: compra.categoria,
        categoria_id: compra.categoria_id,
        forma_pagamento: 'cartao',
        conta_id: null,
        cartao_id: cartao.id,
        fatura_id: fatura.id,
        valor: compra.valor,
        compra_recorrente_id: compra.id,
      }]);
      if (lancError) throw lancError;

      await supabase.from('compras_recorrentes').update({ ultima_competencia: competenciaAtual }).eq('id', compra.id);
      geradas++;
    } catch {
      // Uma falha isolada (ex: corrida de fatura) não deve travar as demais
      // compras recorrentes do lote — a próxima execução diária tenta de novo.
      continue;
    }
  }

  return NextResponse.json({ geradas });
}
