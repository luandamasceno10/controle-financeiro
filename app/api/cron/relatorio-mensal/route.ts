import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

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

  // Roda no dia 1: o "mês fechado" é sempre o mês anterior ao atual.
  const hoje = new Date();
  const mesAnteriorDate = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const ano = mesAnteriorDate.getFullYear();
  const mesIdx = mesAnteriorDate.getMonth();
  const mesRef = `${ano}-${String(mesIdx + 1).padStart(2, '0')}`;

  const { data: subs } = await supabase.from('push_subscriptions').select('*');
  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0 });

  const userIds = Array.from(new Set(subs.map((s) => s.user_id)));
  let sent = 0;

  for (const userId of userIds) {
    const { data: lancamentos } = await supabase
      .from('lancamentos')
      .select('*')
      .eq('user_id', userId)
      .gte('data', `${mesRef}-01`)
      .lte('data', `${mesRef}-31`);

    const entries = lancamentos || [];
    const entrada = entries.filter((e) => e.tipo === 'entrada').reduce((s, e) => s + Number(e.valor), 0);
    const saida = entries.filter((e) => e.tipo === 'saida' && !e.cartao_id).reduce((s, e) => s + Number(e.valor), 0);

    if (entrada === 0 && saida === 0) continue;

    const porCategoria: Record<string, number> = {};
    entries.filter((e) => e.tipo === 'saida' && !e.cartao_id).forEach((e) => {
      porCategoria[e.categoria] = (porCategoria[e.categoria] || 0) + Number(e.valor);
    });
    const topCategorias = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).slice(0, 3);

    const saldo = entrada - saida;
    const title = `📊 Resumo de ${MESES[mesIdx]}`;
    const partes = [
      `Entradas ${currency(entrada)}`,
      `Saídas ${currency(saida)}`,
      `Saldo ${saldo >= 0 ? '+' : ''}${currency(saldo)}`,
    ];
    if (topCategorias.length > 0) {
      partes.push(`Maior gasto: ${topCategorias[0][0]} (${currency(topCategorias[0][1])})`);
    }
    const body = partes.join(' · ');

    const userSubs = subs.filter((s) => s.user_id === userId && s.last_report_month !== mesRef);
    for (const sub of userSubs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body, url: '/' })
        );
        sent++;
        await supabase.from('push_subscriptions').update({ last_report_month: mesRef }).eq('id', sub.id);
      } catch (err: any) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }
  }

  return NextResponse.json({ sent, users: userIds.length, mesRef });
}
