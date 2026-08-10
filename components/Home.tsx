'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { ContaPagar, Lancamento, Categoria, ContaBancaria, CartaoCredito, Fatura, Meta, MetaContribuicao, OrcamentoCategoria, AnaliseIA } from '@/lib/supabase';
import { analyzeFinances } from '@/lib/analyzeWithAI';
import { computeProgresso } from '@/lib/metas';
import { useToast, ToastContainer } from './Toast';
import LancamentoForm from './LancamentoForm';
import { Plus, Landmark, Target, CalendarClock, Receipt, Loader, X, ArrowRight, Wallet, AlertTriangle, Clock, Flame, Tag, ChevronDown, CheckCircle2, Circle } from 'lucide-react';

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const MONTH_NAMES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function Home({ userId, nome }: { userId: string; nome?: string }) {
  const { toasts, addToast, removeToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Lancamento[]>([]);
  const [nextBill, setNextBill] = useState<ContaPagar | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [cartoes, setCartoes] = useState<CartaoCredito[]>([]);
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [contasPagar, setContasPagar] = useState<ContaPagar[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [metasContribuicoes, setMetasContribuicoes] = useState<MetaContribuicao[]>([]);
  const [orcamentos, setOrcamentos] = useState<OrcamentoCategoria[]>([]);

  const [showForm, setShowForm] = useState(false);

  const [analiseHoje, setAnaliseHoje] = useState<AnaliseIA | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [alertasExpandido, setAlertasExpandido] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(true);

  useEffect(() => {
    setOnboardingDismissed(localStorage.getItem('onboarding_dismissed') === '1');
  }, []);

  const dismissOnboarding = () => {
    localStorage.setItem('onboarding_dismissed', '1');
    setOnboardingDismissed(true);
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    const hoje = todayISO();
    // A Home só precisa de lançamentos recentes (mês atual, sequência de dias
    // ativos, faturas em aberto) — não do histórico completo do usuário. 13 meses
    // cobre com folga qualquer fatura aberta esquecida sem crescer sem limite.
    const janelaInicio = new Date();
    janelaInicio.setMonth(janelaInicio.getMonth() - 13);
    const [entriesResult, billsResult, allBillsResult, categoriasResult, contasResult, cartoesResult, faturasResult, metasResult, contribsResult, orcamentosResult, analiseResult] = await Promise.all([
      supabase.from('lancamentos').select('*').eq('user_id', userId).gte('data', janelaInicio.toISOString().slice(0, 10)),
      supabase.from('contas_pagar').select('*').eq('user_id', userId).eq('status', 'pendente').order('vencimento', { ascending: true }).limit(1),
      supabase.from('contas_pagar').select('*').eq('user_id', userId).eq('status', 'pendente'),
      supabase.from('categorias').select('*').eq('user_id', userId).eq('ativa', true).order('ordem'),
      supabase.from('contas_bancarias').select('*').eq('user_id', userId).eq('ativa', true),
      supabase.from('cartoes_credito').select('*').eq('user_id', userId).eq('ativo', true),
      supabase.from('faturas').select('*').eq('user_id', userId).eq('status', 'aberta'),
      supabase.from('metas').select('*').eq('user_id', userId).eq('status', 'ativa'),
      supabase.from('metas_contribuicoes').select('*').eq('user_id', userId),
      supabase.from('orcamentos_categoria').select('*').eq('user_id', userId),
      supabase.from('analises_ia').select('*').eq('user_id', userId).eq('data', hoje).maybeSingle(),
    ]);

    if (entriesResult.data) setEntries(entriesResult.data);
    if (billsResult.data && billsResult.data.length > 0) setNextBill(billsResult.data[0]);
    if (allBillsResult.data) setContasPagar(allBillsResult.data);
    if (categoriasResult.data) setCategorias(categoriasResult.data);
    if (contasResult.data) setContas(contasResult.data);
    if (cartoesResult.data) setCartoes(cartoesResult.data);
    if (faturasResult.data) setFaturas(faturasResult.data);
    if (metasResult.data) setMetas(metasResult.data);
    if (contribsResult.data) setMetasContribuicoes(contribsResult.data);
    if (orcamentosResult.data) setOrcamentos(orcamentosResult.data);
    if (analiseResult.data) setAnaliseHoje(analiseResult.data);
    setLoading(false);
  };

  const categoriasEntrada = useMemo(() => categorias.filter(c => c.tipo === 'entrada'), [categorias]);
  const categoriasSaida = useMemo(() => categorias.filter(c => c.tipo === 'saida'), [categorias]);

  const currentMonth = todayISO().slice(0, 7);
  const monthEntries = useMemo(() => entries.filter(e => e.data.startsWith(currentMonth)), [entries, currentMonth]);

  interface Alerta { id: string; tone: 'rose' | 'amber'; icon: typeof AlertTriangle; message: string; href: string; }

  const alertas = useMemo(() => {
    const hojeISO = todayISO();
    const lista: Alerta[] = [];

    // Contas a pagar que ainda vão vencer já aparecem no card "Próxima conta" —
    // só entram aqui como alerta quando já estão atrasadas, pra não duplicar a informação.
    contasPagar.forEach((cp) => {
      if (cp.vencimento < hojeISO) {
        lista.push({ id: `pagar-${cp.id}`, tone: 'rose', icon: AlertTriangle, message: `"${cp.descricao}" está atrasada (venceu ${fmtDate(cp.vencimento)})`, href: '/dashboard' });
      }
    });

    faturas.forEach((f) => {
      const cartao = cartoes.find((c) => c.id === f.cartao_id);
      if (!cartao) return;
      const total = entries.filter((e) => e.fatura_id === f.id).reduce((s, e) => s + Number(e.valor), 0);
      if (total <= 0) return;
      const dias = Math.round((new Date(f.data_vencimento + 'T00:00:00').getTime() - new Date(hojeISO + 'T00:00:00').getTime()) / 86400000);
      if (dias < 0) {
        lista.push({ id: `fatura-${f.id}`, tone: 'rose', icon: AlertTriangle, message: `Fatura do ${cartao.nome} venceu ${fmtDate(f.data_vencimento)} — ${currency(total)}`, href: '/cartoes' });
      } else if (dias <= 5) {
        lista.push({ id: `fatura-${f.id}`, tone: 'amber', icon: Clock, message: `Fatura do ${cartao.nome} vence em ${dias === 0 ? 'hoje' : `${dias}d`} — ${currency(total)}`, href: '/cartoes' });
      }
    });

    metas.forEach((m) => {
      const contribs = metasContribuicoes.filter((c) => c.meta_id === m.id);
      const p = computeProgresso(Number(m.valor_alvo), m.data_alvo, m.created_at, contribs);
      if (p.noPrazo === false) {
        lista.push({ id: `meta-${m.id}`, tone: 'amber', icon: Target, message: `Meta "${m.nome}" está abaixo do ritmo necessário`, href: '/metas' });
      }
    });

    // Mesma regra de Orcamentos.tsx: compras no cartão só entram no orçamento
    // quando a fatura é paga (não na data da compra), e o gasto de uma
    // subcategoria soma no orçamento da categoria-pai correspondente.
    const gastoPorCategoriaId: Record<number, number> = {};
    monthEntries.filter((e) => e.tipo === 'saida' && e.categoria_id && !e.cartao_id).forEach((e) => {
      gastoPorCategoriaId[e.categoria_id as number] = (gastoPorCategoriaId[e.categoria_id as number] || 0) + Number(e.valor);
    });
    const filhosPorCategoriaId: Record<number, number[]> = {};
    categorias.forEach((c) => {
      if (c.parent_id) (filhosPorCategoriaId[c.parent_id] ||= []).push(c.id);
    });
    orcamentos.forEach((o) => {
      const gasto = (gastoPorCategoriaId[o.categoria_id] || 0)
        + (filhosPorCategoriaId[o.categoria_id] || []).reduce((s, id) => s + (gastoPorCategoriaId[id] || 0), 0);
      if (gasto > Number(o.valor_limite)) {
        const cat = categorias.find((c) => c.id === o.categoria_id);
        lista.push({ id: `orc-${o.id}`, tone: 'rose', icon: Wallet, message: `Orçamento de "${cat?.nome || 'categoria'}" estourou (${currency(gasto)} de ${currency(Number(o.valor_limite))})`, href: '/orcamentos' });
      }
    });

    return lista;
  }, [contasPagar, faturas, cartoes, entries, metas, metasContribuicoes, orcamentos, categorias, monthEntries]);

  // Categoria com maior valor gasto no mês (não a que tem mais lançamentos —
  // "mais lançamentos" não indica onde o dinheiro está realmente indo).
  const categoriaDestaque = useMemo(() => {
    const somaPorCategoria: Record<string, number> = {};
    monthEntries.filter((e) => e.tipo === 'saida' && !e.cartao_id).forEach((e) => {
      somaPorCategoria[e.categoria] = (somaPorCategoria[e.categoria] || 0) + Number(e.valor);
    });
    const top = Object.entries(somaPorCategoria).sort((a, b) => b[1] - a[1])[0];
    if (!top) return null;
    return { nome: top[0], valor: top[1] };
  }, [monthEntries]);

  const streakDias = useMemo(() => {
    const dias = new Set(entries.map((e) => e.data));
    const hojeISO = todayISO();
    const cursor = new Date(hojeISO + 'T00:00:00');
    if (!dias.has(hojeISO)) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (dias.has(cursor.toISOString().slice(0, 10))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }, [entries]);

  const metasInfo = useMemo(() => {
    const noRitmo = metas.filter((m) => {
      const contribs = metasContribuicoes.filter((c) => c.meta_id === m.id);
      return computeProgresso(Number(m.valor_alvo), m.data_alvo, m.created_at, contribs).noPrazo !== false;
    }).length;
    return { total: metas.length, noRitmo };
  }, [metas, metasContribuicoes]);

  const runAnalysis = async () => {
    if (analiseHoje) {
      setShowAnalysis(true);
      return;
    }
    setAnalysisLoading(true);
    try {
      const entrada = monthEntries.filter(e => e.tipo === 'entrada').reduce((s, e) => s + Number(e.valor), 0);
      const saida = monthEntries.filter(e => e.tipo === 'saida').reduce((s, e) => s + Number(e.valor), 0);
      const totals = { entrada, saida, saldo: entrada - saida };
      const monthIdx = new Date().getMonth();
      const text = await analyzeFinances(monthEntries, totals, MONTH_NAMES_FULL[monthIdx]);

      const hoje = todayISO();
      const { data, error } = await supabase.from('analises_ia').insert([{
        user_id: userId, data: hoje, mes_referencia: currentMonth, texto: text,
      }]).select().single();
      if (error) throw error;

      setAnaliseHoje(data);
      setShowAnalysis(true);
    } catch (err: any) {
      addToast('Erro na análise: ' + err.message, 'error');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  const onboardingSteps = useMemo(() => [
    { id: 'conta', label: 'Cadastre uma conta bancária', done: contas.length > 0, href: '/contas' },
    { id: 'lancamento', label: 'Registre seu primeiro lançamento', done: entries.length > 0, href: '/dashboard' },
    { id: 'orcamento', label: 'Defina um orçamento por categoria', done: orcamentos.length > 0, href: '/orcamentos' },
    { id: 'meta', label: 'Crie uma meta financeira', done: metas.length > 0, href: '/metas' },
  ], [contas, entries, orcamentos, metas]);
  const onboardingConcluido = onboardingSteps.every((s) => s.done);
  const mostrarOnboarding = !loading && !onboardingDismissed && !onboardingConcluido;

  return (
    <main className="max-w-3xl mx-auto px-5 py-8 space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div>
        <p className="text-xs text-slate-400 dark:text-slate-500 capitalize">{hoje}</p>
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Olá{nome ? `, ${nome}` : ''}! 👋</h1>
      </div>

      {mostrarOnboarding && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Complete seu setup</h2>
            <button onClick={dismissOnboarding} className="text-slate-300 dark:text-slate-500 hover:text-slate-500 dark:hover:text-slate-300 p-1"><X size={14} /></button>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">{onboardingSteps.filter((s) => s.done).length} de {onboardingSteps.length} passos concluídos</p>
          <div className="space-y-1">
            {onboardingSteps.map((s) => (
              <Link
                key={s.id}
                href={s.href}
                className={`flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-colors ${s.done ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
              >
                {s.done ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0" /> : <Circle size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />}
                <span className={s.done ? 'line-through' : ''}>{s.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {alertas.length > 0 && (() => {
        const ordenados = [...alertas].sort((a, b) => (a.tone === 'rose' ? 0 : 1) - (b.tone === 'rose' ? 0 : 1));
        const urgentes = ordenados.filter((a) => a.tone === 'rose').length;
        const [principal, ...resto] = ordenados;
        const PrincipalIcon = principal.icon;
        const principalTone = principal.tone === 'rose' ? 'text-rose-600 bg-rose-50 dark:bg-rose-500/10' : 'text-amber-600 bg-amber-50 dark:bg-amber-500/10';

        return (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <Link href={principal.href} className="flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${principalTone}`}>
                <PrincipalIcon size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{principal.message}</p>
                {alertas.length > 1 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    +{alertas.length - 1} outro{alertas.length - 1 > 1 ? 's' : ''} alerta{alertas.length - 1 > 1 ? 's' : ''}
                    {urgentes > 1 ? ` · ${urgentes} urgentes` : ''}
                  </p>
                )}
              </div>
              <ArrowRight size={15} className="text-slate-300 shrink-0" />
            </Link>

            {resto.length > 0 && (
              <>
                <button
                  onClick={() => setAlertasExpandido((v) => !v)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 border-t border-slate-100 dark:border-slate-800 py-2 transition-colors"
                >
                  {alertasExpandido ? 'Ocultar' : 'Ver todos'}
                  <ChevronDown size={13} className={`transition-transform ${alertasExpandido ? 'rotate-180' : ''}`} />
                </button>
                {alertasExpandido && (
                  <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-50 dark:divide-slate-800">
                    {resto.map((a) => {
                      const Icon = a.icon;
                      const dotTone = a.tone === 'rose' ? 'bg-rose-500' : 'bg-amber-500';
                      return (
                        <Link key={a.id} href={a.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotTone}`} />
                          <Icon size={14} className="text-slate-400 dark:text-slate-500 shrink-0" />
                          <p className="text-xs text-slate-600 dark:text-slate-300 flex-1 min-w-0 truncate">{a.message}</p>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 flex items-center justify-center mb-2">
            <Receipt size={15} />
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">Lançamentos este mês</p>
          <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">{loading ? '—' : monthEntries.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 flex items-center justify-center mb-2">
            <CalendarClock size={15} />
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">Próxima conta</p>
          {loading ? (
            <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">—</p>
          ) : nextBill ? (
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{nextBill.descricao} · {fmtDate(nextBill.vencimento)}</p>
          ) : (
            <p className="text-sm text-slate-400 dark:text-slate-500">Nenhuma pendente</p>
          )}
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-500/10 text-orange-500 flex items-center justify-center mb-2">
            <Flame size={15} />
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">Sequência ativa</p>
          <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">{loading ? '—' : streakDias > 0 ? `${streakDias} dia${streakDias > 1 ? 's' : ''}` : '—'}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 flex items-center justify-center mb-2">
            <Tag size={15} />
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">Maior gasto do mês</p>
          {loading ? (
            <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">—</p>
          ) : categoriaDestaque ? (
            <>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{categoriaDestaque.nome}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{currency(categoriaDestaque.valor)}</p>
            </>
          ) : (
            <p className="text-sm text-slate-400 dark:text-slate-500">Sem gastos ainda</p>
          )}
        </div>
      </div>

      {!loading && metasInfo.total > 0 && (
        <Link href="/metas" className="flex items-center gap-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:border-slate-300 transition-colors">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
            <Target size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{metasInfo.total} meta{metasInfo.total > 1 ? 's' : ''} em andamento</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{metasInfo.noRitmo} de {metasInfo.total} no ritmo certo</p>
          </div>
          <ArrowRight size={16} className="text-slate-400 dark:text-slate-500 shrink-0" />
        </Link>
      )}

      {!loading && contas.length === 0 ? (
        <Link
          href="/contas"
          className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 rounded-xl p-4 hover:bg-emerald-100/60 transition-colors"
        >
          <div className="w-9 h-9 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0">
            <Landmark size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-800">Cadastre sua primeira conta bancária</p>
            <p className="text-xs text-emerald-600">Informe o saldo atual para o app começar a contabilizar seus lançamentos a partir de hoje.</p>
          </div>
          <ArrowRight size={16} className="text-emerald-600 shrink-0" />
        </Link>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold text-sm px-4 py-3 rounded-lg transition-colors"
        >
          <Plus size={16} strokeWidth={2.5} /> Novo lançamento
        </button>
      )}

      <button
        onClick={runAnalysis}
        disabled={analysisLoading || (monthEntries.length === 0 && !analiseHoje)}
        className="w-full bg-purple-500 hover:bg-purple-400 disabled:bg-slate-300 text-white font-semibold py-3 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
      >
        {analysisLoading ? (
          <><Loader size={16} className="animate-spin" /> Analisando...</>
        ) : analiseHoje ? (
          <>💡 Ver análise de hoje</>
        ) : (
          <>🤖 Analisar com IA</>
        )}
      </button>
      {analiseHoje && <p className="text-xs text-slate-400 dark:text-slate-500 text-center -mt-3">Você já usou sua análise de hoje. Uma nova fica disponível amanhã.</p>}

      {showForm && (
        <LancamentoForm
          userId={userId}
          categoriasEntrada={categoriasEntrada}
          categoriasSaida={categoriasSaida}
          contas={contas}
          cartoes={cartoes}
          editingEntry={null}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadData(); addToast('Lançamento salvo!', 'success'); }}
          onError={(msg) => addToast(msg, 'error')}
        />
      )}

      {showAnalysis && analiseHoje && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-lg">💡 Análise Financeira IA</h3>
              <button onClick={() => setShowAnalysis(false)}><X size={18} /></button>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-slate-700 dark:text-slate-200 text-sm whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
              {analiseHoje.texto}
            </div>
            <button onClick={() => setShowAnalysis(false)} className="w-full mt-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2.5 rounded-lg">
              Fechar
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
