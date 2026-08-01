'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { ContaPagar, Lancamento, Categoria, ContaBancaria, CartaoCredito, Fatura, Meta, MetaContribuicao, OrcamentoCategoria, AnaliseIA } from '@/lib/supabase';
import { analyzeFinances } from '@/lib/analyzeWithAI';
import { computeProgresso } from '@/lib/metas';
import { useToast, ToastContainer } from './Toast';
import LancamentoForm from './LancamentoForm';
import { Plus, LayoutDashboard, Landmark, CreditCard, Target, Tag, CalendarClock, Receipt, Loader, X, ArrowRight, Wallet, WalletCards, AlertTriangle, Clock } from 'lucide-react';

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

const SHORTCUTS = [
  { href: '/dashboard', label: 'Dashboard completo', description: 'Saldo, gráficos e extrato', icon: LayoutDashboard, tone: 'slate' },
  { href: '/contas', label: 'Contas Bancárias', description: 'Cadastre suas contas', icon: Landmark, tone: 'blue' },
  { href: '/cartoes', label: 'Cartões de Crédito', description: 'Fatura e vencimento', icon: CreditCard, tone: 'violet' },
  { href: '/pagar-receber', label: 'Contas a Pagar/Receber', description: 'Fixas, recorrentes ou parceladas', icon: WalletCards, tone: 'cyan' },
  { href: '/orcamentos', label: 'Orçamentos', description: 'Limite de gastos por categoria', icon: Wallet, tone: 'blue' },
  { href: '/metas', label: 'Metas', description: 'Seus objetivos financeiros', icon: Target, tone: 'emerald' },
  { href: '/categorias', label: 'Categorias', description: 'Gerencie suas categorias', icon: Tag, tone: 'amber' },
];

const TONE_CLASSES: Record<string, string> = {
  slate: 'bg-slate-50 text-slate-600',
  blue: 'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  cyan: 'bg-cyan-50 text-cyan-600',
};

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

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    const hoje = todayISO();
    const [entriesResult, billsResult, allBillsResult, categoriasResult, contasResult, cartoesResult, faturasResult, metasResult, contribsResult, orcamentosResult, analiseResult] = await Promise.all([
      supabase.from('lancamentos').select('*').eq('user_id', userId),
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

    contasPagar.forEach((cp) => {
      if (cp.vencimento < hojeISO) {
        lista.push({ id: `pagar-${cp.id}`, tone: 'rose', icon: AlertTriangle, message: `"${cp.descricao}" está atrasada (venceu ${fmtDate(cp.vencimento)})`, href: '/dashboard' });
      } else {
        const dias = Math.round((new Date(cp.vencimento + 'T00:00:00').getTime() - new Date(hojeISO + 'T00:00:00').getTime()) / 86400000);
        if (dias <= 3) {
          lista.push({ id: `pagar-${cp.id}`, tone: 'amber', icon: Clock, message: `"${cp.descricao}" vence em ${dias === 0 ? 'hoje' : `${dias}d`}`, href: '/dashboard' });
        }
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

    const gastoPorCategoriaId: Record<number, number> = {};
    monthEntries.filter((e) => e.tipo === 'saida' && e.categoria_id).forEach((e) => {
      gastoPorCategoriaId[e.categoria_id as number] = (gastoPorCategoriaId[e.categoria_id as number] || 0) + Number(e.valor);
    });
    orcamentos.forEach((o) => {
      const gasto = gastoPorCategoriaId[o.categoria_id] || 0;
      if (gasto > Number(o.valor_limite)) {
        const cat = categorias.find((c) => c.id === o.categoria_id);
        lista.push({ id: `orc-${o.id}`, tone: 'rose', icon: Wallet, message: `Orçamento de "${cat?.nome || 'categoria'}" estourou (${currency(gasto)} de ${currency(Number(o.valor_limite))})`, href: '/orcamentos' });
      }
    });

    return lista;
  }, [contasPagar, faturas, cartoes, entries, metas, metasContribuicoes, orcamentos, categorias, monthEntries]);

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

  return (
    <main className="max-w-3xl mx-auto px-5 py-8 space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div>
        <p className="text-xs text-slate-400 capitalize">{hoje}</p>
        <h1 className="text-xl font-semibold text-slate-800">Olá{nome ? `, ${nome}` : ''}! 👋</h1>
      </div>

      {alertas.length > 0 && (
        <div className="space-y-2">
          {alertas.map((a) => {
            const Icon = a.icon;
            const tones = a.tone === 'rose'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-amber-50 border-amber-200 text-amber-800';
            const iconTone = a.tone === 'rose' ? 'text-rose-600' : 'text-amber-600';
            return (
              <Link key={a.id} href={a.href} className={`flex items-center gap-3 border rounded-xl p-3.5 hover:opacity-90 transition-opacity ${tones}`}>
                <Icon size={16} className={`shrink-0 ${iconTone}`} />
                <p className="text-sm font-medium flex-1 min-w-0">{a.message}</p>
                <ArrowRight size={14} className={`shrink-0 ${iconTone}`} />
              </Link>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center mb-2">
            <Receipt size={15} />
          </div>
          <p className="text-xs text-slate-400">Lançamentos este mês</p>
          <p className="text-lg font-semibold text-slate-800">{loading ? '—' : monthEntries.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center mb-2">
            <CalendarClock size={15} />
          </div>
          <p className="text-xs text-slate-400">Próxima conta</p>
          {loading ? (
            <p className="text-lg font-semibold text-slate-800">—</p>
          ) : nextBill ? (
            <p className="text-sm font-semibold text-slate-800 truncate">{nextBill.descricao} · {fmtDate(nextBill.vencimento)}</p>
          ) : (
            <p className="text-sm text-slate-400">Nenhuma pendente</p>
          )}
        </div>
      </div>

      {!loading && contas.length === 0 ? (
        <Link
          href="/contas"
          className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4 hover:bg-emerald-100/60 transition-colors"
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
      {analiseHoje && <p className="text-xs text-slate-400 text-center -mt-3">Você já usou sua análise de hoje. Uma nova fica disponível amanhã.</p>}

      <div className="space-y-2">
        {SHORTCUTS.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-colors"
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${TONE_CLASSES[s.tone]}`}>
                <Icon size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-700">{s.label}</p>
                <p className="text-xs text-slate-400">{s.description}</p>
              </div>
            </Link>
          );
        })}
      </div>

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
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50" onClick={() => setShowAnalysis(false)}>
          <div className="bg-white rounded-xl w-full max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 text-lg">💡 Análise Financeira IA</h3>
              <button onClick={() => setShowAnalysis(false)}><X size={18} /></button>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-slate-700 text-sm whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
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
