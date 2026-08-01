import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function computeAlertMessages(data: {
  contasPagar: any[];
  faturas: any[];
  cartoes: any[];
  lancamentos: any[];
  metas: any[];
  contribuicoes: any[];
  orcamentos: any[];
  categorias: any[];
}): string[] {
  const hojeISO = todayISO();
  const mensagens: string[] = [];

  data.contasPagar.forEach((cp) => {
    if (cp.vencimento < hojeISO) {
      mensagens.push(`"${cp.descricao}" está atrasada (venceu ${fmtDate(cp.vencimento)})`);
    } else {
      const dias = Math.round((new Date(cp.vencimento + 'T00:00:00').getTime() - new Date(hojeISO + 'T00:00:00').getTime()) / 86400000);
      if (dias <= 3) mensagens.push(`"${cp.descricao}" vence em ${dias === 0 ? 'hoje' : `${dias}d`}`);
    }
  });

  data.faturas.forEach((f) => {
    const cartao = data.cartoes.find((c) => c.id === f.cartao_id);
    if (!cartao) return;
    const total = data.lancamentos.filter((l) => l.fatura_id === f.id).reduce((s, l) => s + Number(l.valor), 0);
    if (total <= 0) return;
    const dias = Math.round((new Date(f.data_vencimento + 'T00:00:00').getTime() - new Date(hojeISO + 'T00:00:00').getTime()) / 86400000);
    if (dias < 0) mensagens.push(`Fatura do ${cartao.nome} venceu ${fmtDate(f.data_vencimento)} — ${currency(total)}`);
    else if (dias <= 5) mensagens.push(`Fatura do ${cartao.nome} vence em ${dias === 0 ? 'hoje' : `${dias}d`} — ${currency(total)}`);
  });

  data.metas.forEach((m) => {
    const contribs = data.contribuicoes.filter((c) => c.meta_id === m.id);
    const valorAtual = contribs.reduce((s, c) => s + Number(c.valor), 0);
    if (!m.data_alvo) return;
    const diasRestantes = Math.max(0, Math.round((new Date(m.data_alvo + 'T00:00:00').getTime() - new Date(hojeISO + 'T00:00:00').getTime()) / 86400000));
    if (valorAtual >= Number(m.valor_alvo) || diasRestantes <= 0) return;
    const totalDias = Math.max(1, Math.round((new Date(m.data_alvo + 'T00:00:00').getTime() - new Date(m.created_at.slice(0, 10) + 'T00:00:00').getTime()) / 86400000));
    const decorridos = totalDias - diasRestantes;
    const esperadoAteAgora = Number(m.valor_alvo) * (decorridos / totalDias);
    if (valorAtual < esperadoAteAgora) mensagens.push(`Meta "${m.nome}" está abaixo do ritmo necessário`);
  });

  const mesAtual = hojeISO.slice(0, 7);
  const gastoPorCategoriaId: Record<number, number> = {};
  data.lancamentos.filter((l) => l.tipo === 'saida' && l.categoria_id && !l.cartao_id && l.data.startsWith(mesAtual)).forEach((l) => {
    gastoPorCategoriaId[l.categoria_id] = (gastoPorCategoriaId[l.categoria_id] || 0) + Number(l.valor);
  });
  data.orcamentos.forEach((o) => {
    // Um orçamento numa categoria "pai" também soma o gasto das suas subcategorias
    const filhas = data.categorias.filter((c) => c.parent_id === o.categoria_id).map((c) => c.id);
    const gasto = [o.categoria_id, ...filhas].reduce((s, id) => s + (gastoPorCategoriaId[id] || 0), 0);
    if (gasto > Number(o.valor_limite)) {
      const cat = data.categorias.find((c) => c.id === o.categoria_id);
      mensagens.push(`Orçamento de "${cat?.nome || 'categoria'}" estourou (${currency(gasto)} de ${currency(Number(o.valor_limite))})`);
    }
  });

  return mensagens;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  const { data: subs } = await supabase.from('push_subscriptions').select('*');
  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0, users: 0 });

  const hojeISO = todayISO();
  const userIds = Array.from(new Set(subs.map((s) => s.user_id)));

  let sent = 0;
  for (const userId of userIds) {
    const [contasPagarRes, faturasRes, cartoesRes, lancamentosRes, metasRes, contribRes, orcamentosRes, categoriasRes] = await Promise.all([
      supabase.from('contas_pagar').select('*').eq('user_id', userId).eq('status', 'pendente'),
      supabase.from('faturas').select('*').eq('user_id', userId).eq('status', 'aberta'),
      supabase.from('cartoes_credito').select('*').eq('user_id', userId).eq('ativo', true),
      supabase.from('lancamentos').select('*').eq('user_id', userId),
      supabase.from('metas').select('*').eq('user_id', userId).eq('status', 'ativa'),
      supabase.from('metas_contribuicoes').select('*').eq('user_id', userId),
      supabase.from('orcamentos_categoria').select('*').eq('user_id', userId),
      supabase.from('categorias').select('*').eq('user_id', userId),
    ]);

    const mensagens = computeAlertMessages({
      contasPagar: contasPagarRes.data || [],
      faturas: faturasRes.data || [],
      cartoes: cartoesRes.data || [],
      lancamentos: lancamentosRes.data || [],
      metas: metasRes.data || [],
      contribuicoes: contribRes.data || [],
      orcamentos: orcamentosRes.data || [],
      categorias: categoriasRes.data || [],
    });

    if (mensagens.length === 0) continue;

    const title = mensagens.length === 1 ? 'Controle Financeiro' : `Controle Financeiro — ${mensagens.length} alertas`;
    const body = mensagens.slice(0, 3).join(' · ');

    const userSubs = subs.filter((s) => s.user_id === userId && s.last_notified_date !== hojeISO);
    for (const sub of userSubs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body, url: '/' })
        );
        sent++;
        await supabase.from('push_subscriptions').update({ last_notified_date: hojeISO }).eq('id', sub.id);
      } catch (err: any) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }
  }

  return NextResponse.json({ sent, users: userIds.length });
}
