import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
}

async function enviarEmailRelatorio(params: {
  destinatario: string;
  mesLabel: string;
  mesRef: string;
  saldo: number;
  taxaPoupanca: number;
  qtdOrcamentosEstourados: number;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const { destinatario, mesLabel, mesRef, saldo, taxaPoupanca, qtdOrcamentosEstourados } = params;
  const linkDashboard = `${appUrl()}/dashboard?mes=${mesRef}`;

  // De propósito bem enxuto — o detalhamento (fixo x variável, orçado x
  // realizado, plano de ação) mora só no PDF, pra não duplicar o dashboard.
  const html = `
    <div style="font-family:-apple-system,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1e293b;">
      <div style="background:#0f172a;color:#fff;border-radius:12px 12px 0 0;padding:20px 24px;">
        <p style="margin:0;font-size:12px;color:#94a3b8;">Controle Financeiro Pessoal</p>
        <h1 style="margin:4px 0 0;font-size:18px;">O raio-X de ${mesLabel}</h1>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
        <p style="margin:0 0 4px;font-size:12px;color:#64748b;">Resultado líquido do mês</p>
        <p style="margin:0 0 20px;font-size:26px;font-weight:800;color:${saldo >= 0 ? '#059669' : '#e11d48'};">${saldo >= 0 ? '+' : ''}${currency(saldo)}</p>
        <p style="margin:0;font-size:13px;color:#334155;">Você guardou <strong>${taxaPoupanca.toFixed(0)}%</strong> do que recebeu antes mesmo dos gastos do dia a dia.</p>
        ${qtdOrcamentosEstourados > 0 ? `
        <p style="margin:16px 0 0;font-size:13px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;">⚠️ ${qtdOrcamentosEstourados} categoria${qtdOrcamentosEstourados > 1 ? 's' : ''} passou${qtdOrcamentosEstourados > 1 ? 'ram' : ''} do orçamento — os detalhes e o plano de ação estão no PDF.</p>
        ` : ''}
        <a href="${linkDashboard}" style="display:block;text-align:center;margin-top:22px;background:#10b981;color:#0f172a;font-weight:700;font-size:14px;text-decoration:none;padding:12px;border-radius:8px;">Abrir o mês no app e baixar o PDF completo</a>
        <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:10px;">O relatório completo — fixos x variáveis, top gastos, orçado x realizado e plano de ação — fica disponível como PDF direto na aba Mensal do Dashboard.</p>
      </div>
    </div>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Controle Financeiro <onboarding@resend.dev>',
        to: destinatario,
        subject: `📊 Seu relatório de ${mesLabel} está pronto`,
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
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

  // Roda no dia 1: o "mês fechado" é sempre o mês anterior ao atual.
  const hoje = new Date();
  const mesAnteriorDate = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const ano = mesAnteriorDate.getFullYear();
  const mesIdx = mesAnteriorDate.getMonth();
  const mesRef = `${ano}-${String(mesIdx + 1).padStart(2, '0')}`;

  const { data: subs } = await supabase.from('push_subscriptions').select('*');

  // E-mail não depende de push subscription — pega todos os usuários da conta.
  let allUsers: { id: string; email?: string }[] = [];
  if (process.env.RESEND_API_KEY) {
    const { data: usersPage } = await supabase.auth.admin.listUsers({ perPage: 200 });
    allUsers = usersPage?.users || [];
  }

  const userIds = Array.from(new Set([...(subs || []).map((s) => s.user_id), ...allUsers.map((u) => u.id)]));
  if (userIds.length === 0) return NextResponse.json({ sent: 0 });

  let sent = 0;
  let emailsSent = 0;

  for (const userId of userIds) {
    const [{ data: lancamentos }, { data: categorias }, { data: orcamentos }] = await Promise.all([
      supabase.from('lancamentos').select('*').eq('user_id', userId).gte('data', `${mesRef}-01`).lte('data', `${mesRef}-31`),
      supabase.from('categorias').select('*').eq('user_id', userId),
      supabase.from('orcamentos_categoria').select('*').eq('user_id', userId),
    ]);

    const entries = lancamentos || [];
    const entrada = entries.filter((e) => e.tipo === 'entrada').reduce((s, e) => s + Number(e.valor), 0);
    const saida = entries.filter((e) => e.tipo === 'saida' && !e.cartao_id).reduce((s, e) => s + Number(e.valor), 0);

    if (entrada === 0 && saida === 0) continue;

    const porCategoria: Record<string, number> = {};
    const porCategoriaId: Record<number, number> = {};
    entries.filter((e) => e.tipo === 'saida' && !e.cartao_id).forEach((e) => {
      porCategoria[e.categoria] = (porCategoria[e.categoria] || 0) + Number(e.valor);
      if (e.categoria_id) porCategoriaId[e.categoria_id] = (porCategoriaId[e.categoria_id] || 0) + Number(e.valor);
    });
    const topCategorias = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).slice(0, 3);

    const categoriasList = categorias || [];
    const orcamentosEstourados = (orcamentos || [])
      .map((o) => {
        const filhas = categoriasList.filter((c) => c.parent_id === o.categoria_id).map((c) => c.id);
        const gasto = [o.categoria_id, ...filhas].reduce((s, id) => s + (porCategoriaId[id] || 0), 0);
        const cat = categoriasList.find((c) => c.id === o.categoria_id);
        return { nome: cat?.nome || 'categoria', gasto, limite: Number(o.valor_limite) };
      })
      .filter((o) => o.gasto > o.limite);

    const saldo = entrada - saida;
    const title = `📊 Resumo de ${MESES[mesIdx]}`;
    const partes = [
      `Entradas ${currency(entrada)}`,
      `Saídas ${currency(saida)}`,
      `Saldo ${saldo >= 0 ? '+' : ''}${currency(saldo)}`,
    ];
    if (orcamentosEstourados.length > 0) {
      partes.push(`${orcamentosEstourados.length} orçamento${orcamentosEstourados.length > 1 ? 's' : ''} estourado${orcamentosEstourados.length > 1 ? 's' : ''}`);
    } else if (topCategorias.length > 0) {
      partes.push(`Maior gasto: ${topCategorias[0][0]} (${currency(topCategorias[0][1])})`);
    }
    const body = partes.join(' · ');

    const taxaPoupanca = entrada > 0 ? (saldo / entrada) * 100 : 0;

    const usuario = allUsers.find((u) => u.id === userId);
    if (usuario?.email) {
      const ok = await enviarEmailRelatorio({
        destinatario: usuario.email,
        mesLabel: `${MESES[mesIdx]} de ${ano}`,
        mesRef,
        saldo,
        taxaPoupanca,
        qtdOrcamentosEstourados: orcamentosEstourados.length,
      });
      if (ok) emailsSent++;
    }

    const userSubs = (subs || []).filter((s) => s.user_id === userId && s.last_report_month !== mesRef);
    for (const sub of userSubs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body, url: `/dashboard?mes=${mesRef}` })
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

  return NextResponse.json({ sent, emailsSent, users: userIds.length, mesRef });
}
