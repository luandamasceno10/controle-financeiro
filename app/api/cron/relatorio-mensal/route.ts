import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { renderToBuffer } from '@react-pdf/renderer';
import { computeRelatorioMensal } from '@/lib/relatorioCalculos';
import { RelatorioPdfDocument } from '@/lib/relatorioPdfDocument';

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
  pdfBuffer: Buffer;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const { destinatario, mesLabel, mesRef, saldo, taxaPoupanca, qtdOrcamentosEstourados, pdfBuffer } = params;
  const linkDashboard = `${appUrl()}/dashboard?mes=${mesRef}`;

  // De propósito bem enxuto — o detalhamento (Pix x Cartão por categoria,
  // top gastos, orçado x realizado, plano de ação) mora só no PDF anexo,
  // pra não duplicar o dashboard nem exigir login pra ver o resumo completo.
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
        <p style="margin:16px 0 0;font-size:13px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;">⚠️ ${qtdOrcamentosEstourados} categoria${qtdOrcamentosEstourados > 1 ? 's' : ''} passou${qtdOrcamentosEstourados > 1 ? 'ram' : ''} do orçamento — os detalhes e o plano de ação estão no PDF em anexo.</p>
        ` : ''}
        <p style="margin:18px 0 0;font-size:13px;color:#334155;">📎 O relatório completo está em <strong>PDF anexo a este e-mail</strong> — não precisa abrir o app pra ver.</p>
        <a href="${linkDashboard}" style="display:block;text-align:center;margin-top:14px;background:#10b981;color:#0f172a;font-weight:700;font-size:14px;text-decoration:none;padding:12px;border-radius:8px;">Abrir o mês no app</a>
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
        attachments: [{
          filename: `relatorio-${mesRef}.pdf`,
          content: pdfBuffer.toString('base64'),
        }],
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
  const proximoMesRef = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

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
    const [{ data: lancamentos }, { data: categorias }, { data: orcamentos }, { data: comprasRecorrentes }, { data: contasPagar }] = await Promise.all([
      supabase.from('lancamentos').select('*').eq('user_id', userId).gte('data', `${mesRef}-01`).lte('data', `${mesRef}-31`),
      supabase.from('categorias').select('*').eq('user_id', userId),
      supabase.from('orcamentos_categoria').select('*').eq('user_id', userId),
      supabase.from('compras_recorrentes').select('*').eq('user_id', userId).eq('ativa', true),
      supabase.from('contas_pagar').select('*').eq('user_id', userId).eq('status', 'pendente'),
    ]);

    const monthEntries = lancamentos || [];
    if (monthEntries.length === 0) continue;

    const proximasContasPagar = (contasPagar || []).filter((p) => p.vencimento.startsWith(proximoMesRef));

    const relatorio = computeRelatorioMensal({
      monthEntries,
      categorias: categorias || [],
      orcamentos: orcamentos || [],
      comprasRecorrentes: comprasRecorrentes || [],
      proximasContasPagar,
    });

    if (relatorio.entrada === 0 && relatorio.saida === 0) continue;

    const orcamentosEstourados = relatorio.orcamentoRows.filter((o) => o.realizado > o.orcado);
    const topCategorias = [...relatorio.variaveis].sort((a, b) => b.value - a.value).slice(0, 3);

    const title = `📊 Resumo de ${MESES[mesIdx]}`;
    const partes = [
      `Entradas ${currency(relatorio.entrada)}`,
      `Saídas ${currency(relatorio.saida)}`,
      `Saldo ${relatorio.saldo >= 0 ? '+' : ''}${currency(relatorio.saldo)}`,
    ];
    if (orcamentosEstourados.length > 0) {
      partes.push(`${orcamentosEstourados.length} orçamento${orcamentosEstourados.length > 1 ? 's' : ''} estourado${orcamentosEstourados.length > 1 ? 's' : ''}`);
    } else if (topCategorias.length > 0) {
      partes.push(`Maior gasto: ${topCategorias[0].name} (${currency(topCategorias[0].value)})`);
    }
    const body = partes.join(' · ');

    const usuario = allUsers.find((u) => u.id === userId);
    if (usuario?.email) {
      const mesLabel = `${MESES[mesIdx]} de ${ano}`;
      const pdfBuffer = await renderToBuffer(RelatorioPdfDocument({
        mesLabel,
        geradoEm: new Date().toLocaleDateString('pt-BR'),
        data: relatorio,
      }));
      const ok = await enviarEmailRelatorio({
        destinatario: usuario.email,
        mesLabel,
        mesRef,
        saldo: relatorio.saldo,
        taxaPoupanca: relatorio.taxaPoupanca,
        qtdOrcamentosEstourados: orcamentosEstourados.length,
        pdfBuffer,
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
