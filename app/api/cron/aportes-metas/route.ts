import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const hojeISO = todayISO();
  const diaHoje = new Date(hojeISO + 'T00:00:00').getDate();
  const mesAtual = hojeISO.slice(0, 7);

  const { data: metas } = await supabase
    .from('metas')
    .select('*')
    .eq('status', 'ativa')
    .eq('aporte_recorrente_dia', diaHoje)
    .not('aporte_recorrente_valor', 'is', null)
    .neq('aporte_recorrente_ultimo_mes', mesAtual);

  if (!metas || metas.length === 0) return NextResponse.json({ aportes: 0 });

  let aportes = 0;
  for (const meta of metas) {
    // Corrida com aporte manual no mesmo dia: revalida logo antes de gravar
    // para não duplicar caso o campo já tenha sido atualizado nesse meio-tempo.
    if (meta.aporte_recorrente_ultimo_mes === mesAtual) continue;
    if (!meta.aporte_recorrente_conta_id) continue;

    const valor = Number(meta.aporte_recorrente_valor);

    const { data: lanc, error: lancError } = await supabase.from('lancamentos').insert([{
      user_id: meta.user_id,
      conta_id: meta.aporte_recorrente_conta_id,
      data: hojeISO,
      hora: nowTime(),
      descricao: `Meta: ${meta.nome} (aporte automático)`,
      tipo: 'saida',
      categoria: 'Investimentos & Futuro',
      forma_pagamento: 'pix',
      valor,
    }]).select().single();
    if (lancError || !lanc) continue;

    const { error: contribError } = await supabase.from('metas_contribuicoes').insert([{
      meta_id: meta.id,
      user_id: meta.user_id,
      valor,
      nota: 'Aporte automático recorrente',
      lancamento_id: lanc.id,
    }]);
    if (contribError) continue;

    await supabase.from('metas').update({ aporte_recorrente_ultimo_mes: mesAtual }).eq('id', meta.id);

    const { data: contribs } = await supabase.from('metas_contribuicoes').select('valor').eq('meta_id', meta.id);
    const total = (contribs || []).reduce((s, c) => s + Number(c.valor), 0);
    if (total >= Number(meta.valor_alvo)) {
      await supabase.from('metas').update({ status: 'concluida' }).eq('id', meta.id);
    }

    aportes++;
  }

  return NextResponse.json({ aportes });
}
