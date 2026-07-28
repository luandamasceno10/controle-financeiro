'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { ContaPagar, Lancamento, Categoria, ContaBancaria, AnaliseIA } from '@/lib/supabase';
import { analyzeFinances } from '@/lib/analyzeWithAI';
import { useToast, ToastContainer } from './Toast';
import LancamentoForm from './LancamentoForm';
import { Plus, LayoutDashboard, Landmark, CreditCard, Target, Tag, CalendarClock, Receipt, Loader, X } from 'lucide-react';

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
  { href: '/metas', label: 'Metas', description: 'Seus objetivos financeiros', icon: Target, tone: 'emerald' },
  { href: '/categorias', label: 'Categorias', description: 'Gerencie suas categorias', icon: Tag, tone: 'amber' },
];

const TONE_CLASSES: Record<string, string> = {
  slate: 'bg-slate-50 text-slate-600',
  blue: 'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
};

export default function Home({ userId, nome }: { userId: string; nome?: string }) {
  const { toasts, addToast, removeToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Lancamento[]>([]);
  const [nextBill, setNextBill] = useState<ContaPagar | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [contas, setContas] = useState<ContaBancaria[]>([]);

  const [showForm, setShowForm] = useState(false);

  const [analiseHoje, setAnaliseHoje] = useState<AnaliseIA | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    const hoje = todayISO();
    const [entriesResult, billsResult, categoriasResult, contasResult, analiseResult] = await Promise.all([
      supabase.from('lancamentos').select('*').eq('user_id', userId),
      supabase.from('contas_pagar').select('*').eq('user_id', userId).eq('status', 'pendente').order('vencimento', { ascending: true }).limit(1),
      supabase.from('categorias').select('*').eq('user_id', userId).eq('ativa', true).order('ordem'),
      supabase.from('contas_bancarias').select('*').eq('user_id', userId).eq('ativa', true),
      supabase.from('analises_ia').select('*').eq('user_id', userId).eq('data', hoje).maybeSingle(),
    ]);

    if (entriesResult.data) setEntries(entriesResult.data);
    if (billsResult.data && billsResult.data.length > 0) setNextBill(billsResult.data[0]);
    if (categoriasResult.data) setCategorias(categoriasResult.data);
    if (contasResult.data) setContas(contasResult.data);
    if (analiseResult.data) setAnaliseHoje(analiseResult.data);
    setLoading(false);
  };

  const categoriasEntrada = useMemo(() => categorias.filter(c => c.tipo === 'entrada'), [categorias]);
  const categoriasSaida = useMemo(() => categorias.filter(c => c.tipo === 'saida'), [categorias]);

  const currentMonth = todayISO().slice(0, 7);
  const monthEntries = useMemo(() => entries.filter(e => e.data.startsWith(currentMonth)), [entries, currentMonth]);

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

      <button
        onClick={() => setShowForm(true)}
        className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold text-sm px-4 py-3 rounded-lg transition-colors"
      >
        <Plus size={16} strokeWidth={2.5} /> Novo lançamento
      </button>

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
