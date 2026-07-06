'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { Lancamento, ContaPagar, ContaReceber, Previsao } from '@/lib/supabase';
import { useToast, ToastContainer } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';
import { analyzeFinances } from '@/lib/analyzeWithAI';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line
} from 'recharts';
import {
  Plus, Wallet, CreditCard, QrCode, ChevronDown, X, Trash2, Pencil,
  ArrowUpRight, ArrowDownRight, Home, Apple, Car, HeartPulse,
  GraduationCap, Clapperboard, Gift, Users, PiggyBank, Landmark,
  CircleEllipsis, Calendar, AlertTriangle, CheckCircle2, Clock,
  ArrowDownToLine, ArrowUpFromLine, Repeat, ChevronLeft, ChevronRight,
  Target, TrendingUp, BarChart3, Inbox, LogOut, Loader, Search
} from 'lucide-react';

const CATEGORY_META: Record<string, any> = {
  'Moradia': { color: '#2563EB', icon: Home, emoji: '🏠' },
  'Alimentação': { color: '#16A34A', icon: Apple, emoji: '🍎' },
  'Transporte': { color: '#0891B2', icon: Car, emoji: '🚗' },
  'Saúde & Bem-estar': { color: '#DC2626', icon: HeartPulse, emoji: '🩺' },
  'Educação': { color: '#7C3AED', icon: GraduationCap, emoji: '🎓' },
  'Assinaturas & Lazer': { color: '#DB2777', icon: Clapperboard, emoji: '🎬' },
  'Doações e Presentes': { color: '#EA580C', icon: Gift, emoji: '🎁' },
  'Família & Dependentes': { color: '#0D9488', icon: Users, emoji: '👥' },
  'Investimentos & Futuro': { color: '#059669', icon: PiggyBank, emoji: '💰' },
  'Dívidas & Empréstimos': { color: '#B91C1C', icon: Landmark, emoji: '🏦' },
  'Diversos': { color: '#64748B', icon: CircleEllipsis, emoji: '✳️' },
};

const CATEGORIES = Object.keys(CATEGORY_META);
const PAYMENTS = [
  { id: 'pix', label: 'Pix', icon: QrCode },
  { id: 'cartao', label: 'Cartão', icon: CreditCard },
];
const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTH_NAMES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function daysUntil(iso: string) {
  const d1 = new Date(todayISO() + 'T00:00:00');
  const d2 = new Date(iso + 'T00:00:00');
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

function addMonths(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

export default function Dashboard({ userId }: { userId: string }) {
  const { toasts, addToast, removeToast } = useToast();

  const [entries, setEntries] = useState<Lancamento[]>([]);
  const [payable, setPayable] = useState<ContaPagar[]>([]);
  const [receivable, setReceivable] = useState<ContaReceber[]>([]);
  const [forecast, setForecast] = useState<Record<string, number>>({});
  const [saldosAbertura, setSaldosAbertura] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('mensal');

  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Lancamento | null>(null);
  const [showBillForm, setShowBillForm] = useState<'pagar' | 'receber' | null>(null);
  const [showCardDetail, setShowCardDetail] = useState(false);
  const [settleTarget, setSettleTarget] = useState<{ kind: 'pagar' | 'receber'; id: number } | null>(null);
  const [settlePayment, setSettlePayment] = useState<'pix' | 'cartao'>('pix');
  const [editingForecast, setEditingForecast] = useState(false);
  const [forecastInput, setForecastInput] = useState('');
  const [editingSaldoAbertura, setEditingSaldoAbertura] = useState(false);
  const [saldoAberturaInput, setSaldoAberturaInput] = useState('');
  const [savingSaldoAbertura, setSavingSaldoAbertura] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisText, setAnalysisText] = useState('');

  const [filterPayment, setFilterPayment] = useState('todos');
  const [filterCategory, setFilterCategory] = useState('todas');
  const [filterType, setFilterType] = useState('todos');
  const [searchQuery, setSearchQuery] = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'lancamento' | 'payable' | 'receivable'; id: number } | null>(null);

  const [savingForecast, setSavingForecast] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [savingBill, setSavingBill] = useState(false);

  const [form, setForm] = useState({
    desc: '', type: 'saida', category: 'Moradia', payment: 'pix', amount: '', date: todayISO(),
  });

  const [billForm, setBillForm] = useState({
    desc: '', category: 'Moradia', amount: '', due: todayISO(), recurring: false,
  });

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [lancResult, pagarResult, receberResult, previsaoResult, saldosResult] = await Promise.all([
        supabase.from('lancamentos').select('*').eq('user_id', userId),
        supabase.from('contas_pagar').select('*').eq('user_id', userId),
        supabase.from('contas_receber').select('*').eq('user_id', userId),
        supabase.from('previsoes').select('*').eq('user_id', userId),
        supabase.from('saldos_abertura').select('*').eq('user_id', userId),
      ]);

      if (lancResult.data) setEntries(lancResult.data);
      if (pagarResult.data) setPayable(pagarResult.data);
      if (receberResult.data) setReceivable(receberResult.data);
      if (previsaoResult.data) {
        const f: Record<string, number> = {};
        previsaoResult.data.forEach((p: Previsao) => {
          f[p.mes] = p.valor_previsto;
        });
        setForecast(f);
      }
      if (saldosResult.data) {
        const s: Record<number, number> = {};
        saldosResult.data.forEach((row: any) => {
          s[row.ano] = Number(row.valor);
        });
        setSaldosAbertura(s);
      }
    } catch (error: any) {
      addToast('Erro ao carregar dados: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const monthEntries = useMemo(
    () => entries.filter(e => monthKey(e.data) === currentMonth),
    [entries, currentMonth]
  );

  const totals = useMemo(() => {
    const entrada = monthEntries.filter(e => e.tipo === 'entrada').reduce((s, e) => s + Number(e.valor), 0);
    const saida = monthEntries.filter(e => e.tipo === 'saida').reduce((s, e) => s + Number(e.valor), 0);
    const pix = monthEntries.filter(e => e.forma_pagamento === 'pix' && e.tipo === 'saida').reduce((s, e) => s + Number(e.valor), 0);
    const cartao = monthEntries.filter(e => e.forma_pagamento === 'cartao' && e.tipo === 'saida').reduce((s, e) => s + Number(e.valor), 0);
    return { entrada, saida, saldo: entrada - saida, pix, cartao };
  }, [monthEntries]);

  const carryOver = useMemo(() => {
    const [year, month] = currentMonth.split('-').map(Number);
    let acc = saldosAbertura[year] || 0;
    for (let m = 1; m < month; m++) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      const me = entries.filter(e => monthKey(e.data) === key);
      const ent = me.filter(e => e.tipo === 'entrada').reduce((s, e) => s + Number(e.valor), 0);
      const sai = me.filter(e => e.tipo === 'saida').reduce((s, e) => s + Number(e.valor), 0);
      acc += (ent - sai);
    }
    return acc;
  }, [entries, currentMonth, saldosAbertura]);

  const commitment = useMemo(() => {
    const saldoInicial = carryOver;
    const forecastValue = forecast[currentMonth] || 0;
    const disponivel = saldoInicial + totals.entrada - totals.saida;
    const recursosPlanejados = saldoInicial + forecastValue;
    const pct = recursosPlanejados > 0 ? Math.min(Math.round((totals.saida / recursosPlanejados) * 100), 999) : null;
    return {
      disponivel,
      forecastValue,
      pct,
      gasto: totals.saida,
      saldoInicial
    };
  }, [totals, forecast, currentMonth, carryOver]);

  const billTotals = useMemo(() => {
    const aPagar = payable.filter(p => p.status === 'pendente').reduce((s, p) => s + Number(p.valor), 0);
    const aReceber = receivable.filter(r => r.status === 'pendente').reduce((s, r) => s + Number(r.valor), 0);
    const saldoProjetado = commitment.disponivel + aReceber - aPagar;
    return { aPagar, aReceber, saldoProjetado };
  }, [payable, receivable, commitment.disponivel]);

  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    monthEntries.filter(e => e.tipo === 'saida').forEach(e => {
      map[e.categoria] = (map[e.categoria] || 0) + Number(e.valor);
    });
    return Object.entries(map).map(([name, value]) => ({
      name, value, color: CATEGORY_META[name]?.color || '#64748B',
    })).sort((a, b) => b.value - a.value);
  }, [monthEntries]);

  const paymentBarData = useMemo(() => {
    const grouped: Record<string, any> = {};
    monthEntries.filter(e => e.tipo === 'saida').forEach(e => {
      if (!grouped[e.categoria]) grouped[e.categoria] = { category: e.categoria, pix: 0, cartao: 0 };
      grouped[e.categoria][e.forma_pagamento] += Number(e.valor);
    });
    return Object.values(grouped).sort((a, b) => (b.pix + b.cartao) - (a.pix + a.cartao));
  }, [monthEntries]);

  const cardEntries = useMemo(
    () => monthEntries.filter(e => e.tipo === 'saida' && e.forma_pagamento === 'cartao').sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()),
    [monthEntries]
  );

  const cardByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    cardEntries.forEach(e => { map[e.categoria] = (map[e.categoria] || 0) + Number(e.valor); });
    return Object.entries(map).map(([name, value]) => ({ name, value, color: CATEGORY_META[name]?.color || '#64748B' })).sort((a, b) => b.value - a.value);
  }, [cardEntries]);

  const cardTotal = useMemo(() => cardEntries.reduce((s, e) => s + Number(e.valor), 0), [cardEntries]);

  const filtered = useMemo(() => {
    return monthEntries
      .filter(e => filterPayment === 'todos' || e.forma_pagamento === filterPayment)
      .filter(e => filterCategory === 'todas' || e.categoria === filterCategory)
      .filter(e => filterType === 'todos' || e.tipo === filterType)
      .filter(e => e.descricao.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [monthEntries, filterPayment, filterCategory, filterType, searchQuery]);

  const upcomingPayable = useMemo(() => [...payable].sort((a, b) => new Date(a.vencimento).getTime() - new Date(b.vencimento).getTime()), [payable]);
  const upcomingReceivable = useMemo(() => [...receivable].sort((a, b) => new Date(a.vencimento).getTime() - new Date(b.vencimento).getTime()), [receivable]);

  const yearData = useMemo(() => {
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${currentYear}-${String(m).padStart(2, '0')}`;
      const me = entries.filter(e => monthKey(e.data) === key);
      const entrada = me.filter(e => e.tipo === 'entrada').reduce((s, e) => s + Number(e.valor), 0);
      const saida = me.filter(e => e.tipo === 'saida').reduce((s, e) => s + Number(e.valor), 0);
      months.push({ key, label: MONTH_NAMES[m - 1], entrada, saida, saldo: entrada - saida });
    }
    return months;
  }, [entries, currentYear]);

  const yearTotals = useMemo(() => {
    const entrada = yearData.reduce((s, m) => s + m.entrada, 0);
    const saida = yearData.reduce((s, m) => s + m.saida, 0);
    return { entrada, saida, saldo: entrada - saida };
  }, [yearData]);

  const yearCategoryData = useMemo(() => {
    const map: Record<string, number> = {};
    entries.filter(e => monthKey(e.data).startsWith(String(currentYear)) && e.tipo === 'saida').forEach(e => { map[e.categoria] = (map[e.categoria] || 0) + Number(e.valor); });
    return Object.entries(map).map(([name, value]) => ({ name, value, color: CATEGORY_META[name]?.color || '#64748B' })).sort((a, b) => b.value - a.value);
  }, [entries, currentYear]);

  const runAnalysis = async () => {
    setAnalysisLoading(true);
    try {
      const monthIdx = MONTH_NAMES.findIndex((_, i) => currentMonth === `${currentYear}-${String(i + 1).padStart(2, '0')}`);
      const text = await analyzeFinances(monthEntries, totals, MONTH_NAMES_FULL[monthIdx]);
      setAnalysisText(text);
      setShowAnalysis(true);
    } catch (err: any) {
      addToast('Erro na análise: ' + err.message, 'error');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const openNewEntry = () => {
    setEditingEntry(null);
    setForm({ desc: '', type: 'saida', category: 'Moradia', payment: 'pix', amount: '', date: todayISO() });
    setShowForm(true);
  };

  const openEditEntry = (entry: Lancamento) => {
    setEditingEntry(entry);
    setForm({
      desc: entry.descricao,
      type: entry.tipo,
      category: entry.categoria,
      payment: entry.forma_pagamento,
      amount: String(entry.valor),
      date: entry.data,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.desc || !form.amount) return;

    setSavingForm(true);
    try {
      if (editingEntry) {
        const { error } = await supabase.from('lancamentos').update({
          data: form.date,
          descricao: form.desc,
          tipo: form.type,
          categoria: form.category,
          forma_pagamento: form.payment,
          valor: parseFloat(form.amount),
        }).eq('id', editingEntry.id);

        if (error) throw error;
        addToast('Lançamento atualizado com sucesso!', 'success');
      } else {
        const { error } = await supabase.from('lancamentos').insert([{
          user_id: userId,
          data: form.date,
          descricao: form.desc,
          tipo: form.type,
          categoria: form.category,
          forma_pagamento: form.payment,
          valor: parseFloat(form.amount),
        }]);

        if (error) throw error;
        addToast('Lançamento salvo com sucesso!', 'success');
      }

      await loadData();
      setForm({ desc: '', type: 'saida', category: 'Moradia', payment: 'pix', amount: '', date: todayISO() });
      setEditingEntry(null);
      setShowForm(false);
    } catch (err: any) {
      addToast('Erro ao salvar: ' + err.message, 'error');
    } finally {
      setSavingForm(false);
    }
  };

  const removeEntry = async (id: number) => {
    try {
      await supabase.from('lancamentos').delete().eq('id', id);
      await loadData();
      addToast('Lançamento deletado', 'success');
    } catch (err: any) {
      addToast('Erro ao deletar: ' + err.message, 'error');
    }
  };

  const handleBillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billForm.desc || !billForm.amount) return;

    setSavingBill(true);
    try {
      if (showBillForm === 'pagar') {
        await supabase.from('contas_pagar').insert([{
          user_id: userId, descricao: billForm.desc, categoria: billForm.category,
          valor: parseFloat(billForm.amount), vencimento: billForm.due, status: 'pendente', recorrente: billForm.recurring,
        }]);
      } else {
        await supabase.from('contas_receber').insert([{
          user_id: userId, descricao: billForm.desc, valor: parseFloat(billForm.amount),
          vencimento: billForm.due, status: 'pendente', recorrente: billForm.recurring,
        }]);
      }
      await loadData();
      setBillForm({ desc: '', category: 'Moradia', amount: '', due: todayISO(), recurring: false });
      setShowBillForm(null);
      addToast('Conta salva com sucesso!', 'success');
    } catch (err: any) {
      addToast('Erro ao salvar conta: ' + err.message, 'error');
    } finally {
      setSavingBill(false);
    }
  };

  const requestSettle = (kind: 'pagar' | 'receber', id: number) => {
    setSettlePayment('pix');
    setSettleTarget({ kind, id });
  };

  const confirmSettle = async () => {
    if (!settleTarget) return;
    const { kind, id } = settleTarget;

    try {
      if (kind === 'pagar') {
        const target = payable.find(p => p.id === id);
        if (!target) return;

        await supabase.from('lancamentos').insert([{
          user_id: userId, data: todayISO(), descricao: target.descricao,
          tipo: 'saida', categoria: target.categoria, forma_pagamento: settlePayment, valor: target.valor,
        }]);

        await supabase.from('contas_pagar').update({ status: 'pago' }).eq('id', id);

        if (target.recorrente) {
          await supabase.from('contas_pagar').insert([{
            user_id: userId, descricao: target.descricao, categoria: target.categoria,
            valor: target.valor, vencimento: addMonths(target.vencimento, 1), status: 'pendente', recorrente: true,
          }]);
        }
      } else {
        const target = receivable.find(r => r.id === id);
        if (!target) return;

        await supabase.from('lancamentos').insert([{
          user_id: userId, data: todayISO(), descricao: target.descricao,
          tipo: 'entrada', categoria: 'Diversos', forma_pagamento: settlePayment, valor: target.valor,
        }]);

        await supabase.from('contas_receber').update({ status: 'recebido' }).eq('id', id);

        if (target.recorrente) {
          await supabase.from('contas_receber').insert([{
            user_id: userId, descricao: target.descricao, valor: target.valor,
            vencimento: addMonths(target.vencimento, 1), status: 'pendente', recorrente: true,
          }]);
        }
      }

      await loadData();
      setSettleTarget(null);
      addToast('Conta quitada com sucesso!', 'success');
    } catch (err: any) {
      addToast('Erro ao quitar: ' + err.message, 'error');
    }
  };

  const removePayable = async (id: number) => {
    try {
      await supabase.from('contas_pagar').delete().eq('id', id);
      await loadData();
      addToast('Conta deletada', 'success');
    } catch (err: any) {
      addToast('Erro ao deletar: ' + err.message, 'error');
    }
  };

  const removeReceivable = async (id: number) => {
    try {
      await supabase.from('contas_receber').delete().eq('id', id);
      await loadData();
      addToast('Conta deletada', 'success');
    } catch (err: any) {
      addToast('Erro ao deletar: ' + err.message, 'error');
    }
  };

  const shiftMonth = (delta: number) => {
    const [year, month] = currentMonth.split('-').map(Number);
    let newMonth = month + delta;
    let newYear = year;

    if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    } else if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    }

    setCurrentMonth(`${newYear}-${String(newMonth).padStart(2, '0')}`);
  };

  const saveForecast = async () => {
    const v = parseFloat(forecastInput);
    if (!isNaN(v)) {
      setSavingForecast(true);
      try {
        const existing = await supabase
          .from('previsoes')
          .select('*')
          .eq('user_id', userId)
          .eq('mes', currentMonth)
          .single();

        if (existing.data) {
          await supabase.from('previsoes').update({ valor_previsto: v }).eq('id', existing.data.id);
        } else {
          await supabase.from('previsoes').insert([{ user_id: userId, mes: currentMonth, valor_previsto: v }]);
        }

        await loadData();
        setEditingForecast(false);
        addToast('Previsão salva!', 'success');
      } catch (err: any) {
        addToast('Erro ao salvar previsão: ' + err.message, 'error');
      } finally {
        setSavingForecast(false);
      }
    }
  };

  const saveSaldoAbertura = async () => {
    const v = parseFloat(saldoAberturaInput);
    if (isNaN(v)) return;

    setSavingSaldoAbertura(true);
    try {
      const existing = await supabase
        .from('saldos_abertura')
        .select('*')
        .eq('user_id', userId)
        .eq('ano', currentYear)
        .single();

      if (existing.data) {
        await supabase.from('saldos_abertura').update({ valor: v }).eq('id', existing.data.id);
      } else {
        await supabase.from('saldos_abertura').insert([{ user_id: userId, ano: currentYear, valor: v }]);
      }

      await loadData();
      setEditingSaldoAbertura(false);
      addToast('Saldo de abertura salvo!', 'success');
    } catch (err: any) {
      addToast('Erro ao salvar saldo de abertura: ' + err.message, 'error');
    } finally {
      setSavingSaldoAbertura(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const monthIdx = MONTH_NAMES.findIndex((_, i) => currentMonth === `${currentYear}-${String(i + 1).padStart(2, '0')}`);
  const isEmpty = entries.length === 0;
  const isJaneiro = currentMonth.endsWith('-01');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-600"><Loader size={18} className="animate-spin" /> Carregando dados...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-slate-900 text-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-5 py-5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-slate-900">R$</div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Controle Financeiro Pessoal</h1>
              <p className="text-xs text-slate-400">{view === 'mensal' ? `${MONTH_NAMES_FULL[monthIdx]} ${currentYear}` : `${currentYear}`}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-800 rounded-lg p-1">
              <button onClick={() => setView('mensal')} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view === 'mensal' ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'}`}>Mensal</button>
              <button onClick={() => setView('anual')} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view === 'anual' ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'}`}>Anual</button>
            </div>
            {view === 'mensal' && (
              <button onClick={openNewEntry} disabled={savingForm} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-400 text-slate-900 font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors">
                {savingForm ? <Loader size={16} className="animate-spin" /> : <Plus size={16} strokeWidth={2.5} />} {savingForm ? 'Salvando...' : 'Novo'}
              </button>
            )}
            <button onClick={handleLogout} className="text-slate-400 hover:text-slate-200 p-2 rounded-lg hover:bg-slate-800 transition-colors"><LogOut size={18} /></button>
          </div>
        </div>
        {view === 'mensal' && (
          <div className="max-w-6xl mx-auto px-5 pb-4 flex items-center gap-3 overflow-x-auto">
            <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-md hover:bg-slate-800"><ChevronLeft size={16} /></button>
            <div className="flex gap-1">
              {MONTH_NAMES.map((m, i) => {
                const key = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
                return (
                  <button key={key} onClick={() => setCurrentMonth(key)} className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${key === currentMonth ? 'bg-emerald-500 text-slate-900' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>{m}</button>
                );
              })}
            </div>
            <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-md hover:bg-slate-800"><ChevronRight size={16} /></button>
          </div>
        )}
      </header>

      {view === 'mensal' ? (
        <main className="max-w-6xl mx-auto px-5 py-6 space-y-6">
          {isEmpty && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex items-start gap-3">
              <Inbox size={18} className="text-violet-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-violet-800">Painel zerado e pronto pra começar</p>
                <p className="text-xs text-violet-600 mt-0.5">Lance seus gastos e recebimentos aqui e eles serão salvos automaticamente no banco de dados.</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center"><Target size={16} /></div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-700">Comprometimento do mês</h2>
                  <p className="text-xs text-slate-400">Gasto vs. recursos disponíveis (saldo inicial + previsão)</p>
                </div>
              </div>
              {!editingForecast ? (
                <button onClick={() => { setForecastInput(String(forecast[currentMonth] || '')); setEditingForecast(true); }} className="text-xs font-semibold text-violet-600 hover:text-violet-700 border border-violet-200 hover:bg-violet-50 px-3 py-1.5 rounded-lg transition-colors">Previsão</button>
              ) : (
                <div className="flex items-center gap-2">
                  <input type="number" autoFocus value={forecastInput} onChange={(e) => setForecastInput(e.target.value)} className="border border-violet-300 rounded-lg px-2.5 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-violet-400" placeholder="0,00" />
                  <button onClick={saveForecast} disabled={savingForecast} className="text-xs font-semibold bg-violet-600 hover:bg-violet-700 disabled:bg-slate-400 text-white px-3 py-1.5 rounded-lg">{savingForecast ? '...' : '✓'}</button>
                  <button onClick={() => setEditingForecast(false)} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <MiniStat label="Saldo Inicial" value={commitment.saldoInicial} tone="emerald" />
              <MiniStat label="Previsão" value={commitment.forecastValue} tone="violet" />
              <MiniStat label="Disponível" value={commitment.disponivel} tone="slate" bold />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-500">Comprometimento</span>
                <span className={`font-bold ${commitment.pct === null ? 'text-slate-400' : commitment.pct >= 100 ? 'text-rose-600' : commitment.pct >= 80 ? 'text-amber-600' : 'text-emerald-600'}`}>{commitment.pct === null ? '—' : `${commitment.pct}%`}</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${commitment.pct === null ? 'bg-slate-300' : commitment.pct >= 100 ? 'bg-rose-500' : commitment.pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${commitment.pct === null ? 0 : Math.min(commitment.pct, 100)}%` }} />
              </div>
            </div>

            {isJaneiro && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <label className="text-xs font-medium text-slate-500 block">Saldo de Abertura ({currentYear})</label>
                    <p className="text-[11px] text-slate-400">Saldo da conta em 01/01/{currentYear} — base para todo o ano</p>
                  </div>
                  {!editingSaldoAbertura ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-emerald-600">{currency(saldosAbertura[currentYear] || 0)}</span>
                      <button onClick={() => { setSaldoAberturaInput(String(saldosAbertura[currentYear] || '')); setEditingSaldoAbertura(true); }} className="text-xs font-semibold text-violet-600 hover:text-violet-700 border border-violet-200 hover:bg-violet-50 px-3 py-1.5 rounded-lg transition-colors">Editar</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input type="number" autoFocus value={saldoAberturaInput} onChange={(e) => setSaldoAberturaInput(e.target.value)} className="border border-violet-300 rounded-lg px-2.5 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-violet-400" placeholder="0,00" />
                      <button onClick={saveSaldoAbertura} disabled={savingSaldoAbertura} className="text-xs font-semibold bg-violet-600 hover:bg-violet-700 disabled:bg-slate-400 text-white px-3 py-1.5 rounded-lg">{savingSaldoAbertura ? '...' : '✓'}</button>
                      <button onClick={() => setEditingSaldoAbertura(false)} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="Entradas (mês)" value={totals.entrada} icon={ArrowUpRight} tone="emerald" />
            <SummaryCard label="Saídas (mês)" value={totals.saida} icon={ArrowDownRight} tone="rose" />
            <SummaryCard label="Saldo do mês" value={totals.saldo} icon={Wallet} tone={totals.saldo >= 0 ? 'blue' : 'rose'} />
            <SummaryCard label="Saldo projetado" value={billTotals.saldoProjetado} icon={Calendar} tone={billTotals.saldoProjetado >= 0 ? 'violet' : 'rose'} />
          </div>

          <div className="flex gap-2">
            <button
              onClick={runAnalysis}
              disabled={analysisLoading || monthEntries.length === 0}
              className="flex-1 bg-purple-500 hover:bg-purple-400 disabled:bg-slate-400 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
            >
              {analysisLoading ? (
                <>
                  <Loader size={16} className="animate-spin" /> Analisando...
                </>
              ) : (
                <>🤖 Analisar com IA</>
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-cyan-50 flex items-center justify-center shrink-0"><QrCode size={20} className="text-cyan-600" /></div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500">Saídas via Pix</p>
                <p className="text-lg font-bold tabular-nums truncate">{currency(totals.pix)}</p>
                <p className="text-xs text-slate-400">{totals.saida > 0 ? Math.round((totals.pix / totals.saida) * 100) : 0}% do total</p>
              </div>
            </div>
            <button onClick={() => setShowCardDetail(true)} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 text-left hover:border-amber-300 transition-colors">
              <div className="w-11 h-11 rounded-lg bg-amber-50 flex items-center justify-center shrink-0"><CreditCard size={20} className="text-amber-600" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500">Saídas via Cartão</p>
                <p className="text-lg font-bold tabular-nums truncate">{currency(totals.cartao)}</p>
                <p className="text-xs text-amber-600 font-medium">Ver categorias →</p>
              </div>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-1">Despesas por categoria</h2>
              <p className="text-xs text-slate-400 mb-4">Onde seu dinheiro está indo</p>
              {categoryData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={230}>
                    <PieChart>
                      <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                        {categoryData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="white" strokeWidth={2} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => currency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2 max-h-44 overflow-y-auto pr-1">
                    {categoryData.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} /><span className="text-slate-600">{CATEGORY_META[c.name]?.emoji} {c.name}</span></div>
                        <span className="font-semibold tabular-nums shrink-0 ml-2">{currency(c.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <p className="text-center text-slate-400 text-sm py-10">Sem despesas neste mês ainda.</p>}
            </div>

            <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-1">Categoria × Forma de pagamento</h2>
              <p className="text-xs text-slate-400 mb-4">Pix vs Cartão por categoria</p>
              {paymentBarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={paymentBarData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                    <XAxis type="number" tickFormatter={(v) => `R$${v}`} fontSize={11} stroke="#94A3B8" />
                    <YAxis type="category" dataKey="category" width={140} fontSize={10.5} stroke="#94A3B8" />
                    <Tooltip formatter={(v: any) => currency(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="pix" name="Pix" fill="#0891B2" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="cartao" name="Cartão" fill="#D97706" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-slate-400 text-sm py-10">Sem despesas neste mês ainda.</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BillsPanel title="Contas a pagar" icon={ArrowUpFromLine} tone="rose" total={billTotals.aPagar} totalLabel="Em aberto" items={upcomingPayable}
              onAdd={() => { setBillForm({ desc: '', category: 'Moradia', amount: '', due: todayISO(), recurring: false }); setShowBillForm('pagar'); }}
              onToggle={(id) => requestSettle('pagar', id)} onRemove={(id) => { setDeleteConfirm({ type: 'payable', id }); }} doneLabel="pago"
              renderMeta={(item) => <span className="text-[11px] text-slate-400">{CATEGORY_META[item.categoria]?.emoji} {item.categoria}</span>} />
            <BillsPanel title="Contas a receber" icon={ArrowDownToLine} tone="emerald" total={billTotals.aReceber} totalLabel="Em aberto" items={upcomingReceivable}
              onAdd={() => { setBillForm({ desc: '', category: 'Moradia', amount: '', due: todayISO(), recurring: false }); setShowBillForm('receber'); }}
              onToggle={(id) => requestSettle('receber', id)} onRemove={(id) => { setDeleteConfirm({ type: 'receivable', id }); }} doneLabel="recebido" />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold text-slate-700 mr-auto">Histórico de lançamentos</h2>
              <div className="relative flex-1 min-w-48">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Buscar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-800" />
              </div>
              <FilterSelect value={filterType} onChange={setFilterType} options={[{ v: 'todos', l: 'Todos os tipos' }, { v: 'entrada', l: 'Entradas' }, { v: 'saida', l: 'Saídas' }]} />
              <FilterSelect value={filterPayment} onChange={setFilterPayment} options={[{ v: 'todos', l: 'Todas formas' }, { v: 'pix', l: 'Pix' }, { v: 'cartao', l: 'Cartão' }]} />
              <FilterSelect value={filterCategory} onChange={setFilterCategory} options={[{ v: 'todas', l: 'Todas categorias' }, ...CATEGORIES.map(c => ({ v: c, l: `${CATEGORY_META[c].emoji} ${c}` }))]} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="px-5 py-3 font-medium">Data</th><th className="px-5 py-3 font-medium">Descrição</th><th className="px-5 py-3 font-medium">Categoria</th><th className="px-5 py-3 font-medium">Pagamento</th><th className="px-5 py-3 font-medium text-right">Valor</th><th className="px-5 py-3 font-medium w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400 text-sm">Nenhum lançamento encontrado.</td></tr>
                  )}
                  {filtered.map((e) => {
                    const meta = CATEGORY_META[e.categoria];
                    const PayIcon = e.forma_pagamento === 'pix' ? QrCode : CreditCard;
                    return (
                      <tr key={e.id} onClick={() => openEditEntry(e)} className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors group cursor-pointer">
                        <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{fmtDate(e.data)}</td>
                        <td className="px-5 py-3 font-medium text-slate-700">{e.descricao}</td>
                        <td className="px-5 py-3"><span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md" style={{ color: meta?.color, backgroundColor: `${meta?.color}15` }}>{meta?.emoji} {e.categoria}</span></td>
                        <td className="px-5 py-3 text-slate-500"><span className="inline-flex items-center gap-1.5 text-xs"><PayIcon size={13} />{e.forma_pagamento === 'pix' ? 'Pix' : 'Cartão'}</span></td>
                        <td className={`px-5 py-3 text-right font-semibold tabular-nums ${e.tipo === 'entrada' ? 'text-emerald-600' : 'text-slate-700'}`}>{e.tipo === 'entrada' ? '+' : '-'}{currency(Number(e.valor))}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={(ev) => { ev.stopPropagation(); openEditEntry(e); }} className="text-slate-300 hover:text-violet-600 p-1"><Pencil size={14} /></button>
                            <button onClick={(ev) => { ev.stopPropagation(); setDeleteConfirm({ type: 'lancamento', id: e.id }); }} className="text-slate-300 hover:text-rose-500 p-1"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      ) : (
        <AnnualView yearData={yearData} yearTotals={yearTotals} yearCategoryData={yearCategoryData} forecast={forecast} currentYear={currentYear} setCurrentYear={setCurrentYear} onGoToMonth={(k) => { setCurrentMonth(k); setView('mensal'); }} />
      )}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5"><h3 className="font-semibold text-slate-800">{editingEntry ? 'Editar lançamento' : 'Novo lançamento'}</h3><button onClick={() => setShowForm(false)} disabled={savingForm}><X size={18} /></button></div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setForm(f => ({ ...f, type: 'entrada' }))} className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.type === 'entrada' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-600 border-slate-200'}`}>Entrada</button>
                <button type="button" onClick={() => setForm(f => ({ ...f, type: 'saida' }))} className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.type === 'saida' ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-slate-600 border-slate-200'}`}>Saída</button>
              </div>
              <div><label className="text-xs font-medium text-slate-500 mb-1 block">Descrição</label><input type="text" value={form.desc} onChange={(e) => setForm(f => ({ ...f, desc: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" required disabled={savingForm} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-slate-500 mb-1 block">Valor (R$)</label><input type="number" step="0.01" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" required disabled={savingForm} /></div>
                <div><label className="text-xs font-medium text-slate-500 mb-1 block">Data</label><input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" disabled={savingForm} /></div>
              </div>
              <div><label className="text-xs font-medium text-slate-500 mb-1 block">Categoria</label><select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white" disabled={savingForm}>{CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_META[c].emoji} {c}</option>)}</select></div>
              <div><label className="text-xs font-medium text-slate-500 mb-1 block">Forma de pagamento</label><div className="grid grid-cols-2 gap-2">{PAYMENTS.map(p => { const Icon = p.icon; return (<button key={p.id} type="button" onClick={() => setForm(f => ({ ...f, payment: p.id as any }))} disabled={savingForm} className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.payment === p.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}><Icon size={15} /> {p.label}</button>); })}</div></div>
              <div className="flex gap-2">
                {editingEntry && (
                  <button type="button" onClick={() => { setShowForm(false); setDeleteConfirm({ type: 'lancamento', id: editingEntry.id }); }} className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors">
                    <Trash2 size={16} />
                  </button>
                )}
                <button type="submit" disabled={savingForm} className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-400 text-slate-900 font-semibold py-2.5 rounded-lg text-sm transition-colors">{savingForm ? 'Salvando...' : editingEntry ? 'Salvar alterações' : 'Salvar lançamento'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBillForm && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50" onClick={() => setShowBillForm(null)}>
          <div className="bg-white rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5"><h3 className="font-semibold text-slate-800">Nova conta a {showBillForm === 'pagar' ? 'pagar' : 'receber'}</h3><button onClick={() => setShowBillForm(null)} disabled={savingBill}><X size={18} /></button></div>
            <form onSubmit={handleBillSubmit} className="space-y-4">
              <div><label className="text-xs font-medium text-slate-500 mb-1 block">Descrição</label><input type="text" value={billForm.desc} onChange={(e) => setBillForm(f => ({ ...f, desc: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" required disabled={savingBill} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-slate-500 mb-1 block">Valor (R$)</label><input type="number" step="0.01" value={billForm.amount} onChange={(e) => setBillForm(f => ({ ...f, amount: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" required disabled={savingBill} /></div>
                <div><label className="text-xs font-medium text-slate-500 mb-1 block">Vencimento</label><input type="date" value={billForm.due} onChange={(e) => setBillForm(f => ({ ...f, due: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" required disabled={savingBill} /></div>
              </div>
              {showBillForm === 'pagar' && (<div><label className="text-xs font-medium text-slate-500 mb-1 block">Categoria</label><select value={billForm.category} onChange={(e) => setBillForm(f => ({ ...f, category: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white" disabled={savingBill}>{CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_META[c].emoji} {c}</option>)}</select></div>)}
              <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50"><input type="checkbox" checked={billForm.recurring} onChange={(e) => setBillForm(f => ({ ...f, recurring: e.target.checked }))} className="w-4 h-4 accent-slate-800" disabled={savingBill} /><Repeat size={15} className="text-slate-500" /><span className="text-sm text-slate-600">Repetir todo mês</span></label>
              <button type="submit" disabled={savingBill} className={`w-full font-semibold py-2.5 rounded-lg text-sm transition-colors ${showBillForm === 'pagar' ? 'bg-rose-500 hover:bg-rose-400 disabled:bg-slate-400 text-white' : 'bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-400 text-slate-900'}`}>{savingBill ? 'Salvando...' : 'Salvar conta'}</button>
            </form>
          </div>
        </div>
      )}

      {settleTarget && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50" onClick={() => setSettleTarget(null)}>
          <div className="bg-white rounded-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 mb-1">Como foi {settleTarget.kind === 'pagar' ? 'pago' : 'recebido'}?</h3>
            <p className="text-xs text-slate-400 mb-4">Isso será usado para categorizar corretamente.</p>
            <div className="grid grid-cols-2 gap-2 mb-5">{PAYMENTS.map(p => { const Icon = p.icon; return (<button key={p.id} type="button" onClick={() => setSettlePayment(p.id as any)} className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-colors ${settlePayment === p.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}><Icon size={15} /> {p.label}</button>); })}</div>
            <div className="flex gap-2"><button onClick={() => setSettleTarget(null)} className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600">Cancelar</button><button onClick={confirmSettle} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-900">Confirmar</button></div>
          </div>
        </div>
      )}

      {showCardDetail && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50" onClick={() => setShowCardDetail(false)}>
          <div className="bg-white rounded-xl w-full max-w-2xl p-6 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1"><h3 className="font-semibold text-slate-800 flex items-center gap-2"><CreditCard size={18} className="text-amber-600" /> Fatura do cartão</h3><button onClick={() => setShowCardDetail(false)}><X size={18} /></button></div>
            <p className="text-xs text-slate-400 mb-5">Total no cartão em {monthIdx >= 0 ? MONTH_NAMES_FULL[monthIdx] : 'mês'}: <span className="font-semibold text-slate-600">{currency(cardTotal)}</span></p>
            {cardByCategory.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart><Pie data={cardByCategory} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>{cardByCategory.map((entry, i) => <Cell key={i} fill={entry.color} stroke="white" strokeWidth={2} />)}</Pie><Tooltip formatter={(v: any) => currency(v)} /></PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {cardByCategory.map((c, i) => {
                      const pct = cardTotal > 0 ? Math.round((c.value / cardTotal) * 100) : 0;
                      return (<div key={i}><div className="flex items-center justify-between text-xs mb-1"><span className="text-slate-600 font-medium">{CATEGORY_META[c.name]?.emoji} {c.name}</span><span className="font-semibold tabular-nums">{currency(c.value)}</span></div><div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} /></div></div>);
                    })}
                  </div>
                </div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Compras no cartão</h4>
                <div className="border border-slate-100 rounded-lg overflow-hidden">
                  <table className="w-full text-sm"><tbody>
                    {cardEntries.map((e) => { const meta = CATEGORY_META[e.categoria]; return (<tr key={e.id} className="border-b border-slate-50 last:border-0"><td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{fmtDate(e.data)}</td><td className="px-4 py-2.5 font-medium text-slate-700">{e.descricao}</td><td className="px-4 py-2.5"><span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md" style={{ color: meta?.color, backgroundColor: `${meta?.color}15` }}>{meta?.emoji} {e.categoria}</span></td><td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-700">{currency(Number(e.valor))}</td></tr>); })}
                  </tbody></table>
                </div>
              </>
            ) : <p className="text-center text-slate-400 text-sm py-10">Nenhuma compra no cartão neste mês.</p>}
          </div>
        </div>
      )}

      {showAnalysis && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50" onClick={() => setShowAnalysis(false)}>
          <div className="bg-white rounded-xl w-full max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 text-lg">💡 Análise Financeira IA</h3>
              <button onClick={() => setShowAnalysis(false)}><X size={18} /></button>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-slate-700 text-sm whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
              {analysisText}
            </div>
            <button onClick={() => setShowAnalysis(false)} className="w-full mt-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2.5 rounded-lg">
              Fechar
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirm !== null}
        title="Confirmar exclusão"
        message={deleteConfirm?.type === 'lancamento' ? 'Tem certeza que quer deletar este lançamento?' : 'Tem certeza que quer deletar esta conta?'}
        confirmText="Deletar"
        cancelText="Cancelar"
        danger
        onConfirm={() => {
          if (!deleteConfirm) return;
          if (deleteConfirm.type === 'lancamento') removeEntry(deleteConfirm.id);
          else if (deleteConfirm.type === 'payable') removePayable(deleteConfirm.id);
          else removeReceivable(deleteConfirm.id);
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

function AnnualView({ yearData, yearTotals, yearCategoryData, forecast, currentYear, setCurrentYear, onGoToMonth }: any) {
  const totalForecast = Object.values(forecast).reduce((s: number, v: any) => s + v, 0);
  return (
    <main className="max-w-6xl mx-auto px-5 py-6 space-y-6">
      <div className="flex items-center justify-center gap-4 mb-4">
        <button onClick={() => setCurrentYear(currentYear - 1)} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 hover:bg-slate-50"><ChevronLeft size={14} /> {currentYear - 1}</button>
        <span className="text-sm font-semibold text-slate-700">{currentYear}</span>
        <button onClick={() => setCurrentYear(currentYear + 1)} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 hover:bg-slate-50">{currentYear + 1} <ChevronRight size={14} /></button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Entradas no ano" value={yearTotals.entrada} icon={ArrowUpRight} tone="emerald" />
        <SummaryCard label="Saídas no ano" value={yearTotals.saida} icon={ArrowDownRight} tone="rose" />
        <SummaryCard label="Saldo do ano" value={yearTotals.saldo} icon={Wallet} tone={yearTotals.saldo >= 0 ? 'blue' : 'rose'} />
        <SummaryCard label="Previsão total" value={totalForecast} icon={Target} tone="violet" />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Entradas x Saídas por mês</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={yearData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
            <XAxis dataKey="label" fontSize={11} stroke="#94A3B8" />
            <YAxis tickFormatter={(v: any) => `R$${v}`} fontSize={11} stroke="#94A3B8" />
            <Tooltip formatter={(v: any) => currency(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="entrada" name="Entradas" fill="#10B981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="saida" name="Saídas" fill="#F43F5E" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Evolução do saldo mensal</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={yearData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
            <XAxis dataKey="label" fontSize={11} stroke="#94A3B8" />
            <YAxis tickFormatter={(v: any) => `R$${v}`} fontSize={11} stroke="#94A3B8" />
            <Tooltip formatter={(v: any) => currency(v)} />
            <Line type="monotone" dataKey="saldo" name="Saldo" stroke="#7C3AED" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Despesas por categoria — ano todo</h2>
        {yearCategoryData.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={yearCategoryData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {yearCategoryData.map((entry: any, i: number) => <Cell key={i} fill={entry.color} stroke="white" strokeWidth={2} />)}
                </Pie>
                <Tooltip formatter={(v: any) => currency(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 self-center">
              {yearCategoryData.map((c: any, i: number) => {
                return (<div key={i} className="flex items-center justify-between text-xs"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} /><span className="text-slate-600">{CATEGORY_META[c.name]?.emoji} {c.name}</span></div><span className="font-semibold tabular-nums">{currency(c.value)}</span></div>);
              })}
            </div>
          </div>
        ) : <p className="text-center text-slate-400 text-sm py-10">Sem dados no ano ainda.</p>}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100"><h2 className="text-sm font-semibold text-slate-700">Resumo mês a mês</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-100"><th className="px-5 py-3 font-medium">Mês</th><th className="px-5 py-3 font-medium text-right">Entradas</th><th className="px-5 py-3 font-medium text-right">Saídas</th><th className="px-5 py-3 font-medium text-right">Saldo</th></tr></thead>
            <tbody>
              {yearData.map((m: any) => (
                <tr key={m.key} className="border-b border-slate-50 hover:bg-slate-50/80 cursor-pointer transition-colors" onClick={() => onGoToMonth(m.key)}>
                  <td className="px-5 py-2.5 font-medium text-slate-700">{m.label}</td>
                  <td className="px-5 py-2.5 text-right text-emerald-600 font-semibold tabular-nums">{currency(m.entrada)}</td>
                  <td className="px-5 py-2.5 text-right text-rose-600 font-semibold tabular-nums">{currency(m.saida)}</td>
                  <td className={`px-5 py-2.5 text-right font-bold tabular-nums ${m.saldo >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>{currency(m.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function MiniStat({ label, value, tone, bold }: any) {
  const tones: any = { violet: 'text-violet-600', emerald: 'text-emerald-600', blue: 'text-blue-600', rose: 'text-rose-600', slate: 'text-slate-800' };
  return (<div><p className="text-[11px] text-slate-400 mb-0.5">{label}</p><p className={`text-base tabular-nums ${bold ? 'font-bold' : 'font-semibold'} ${tones[tone]}`}>{currency(value)}</p></div>);
}

function SummaryCard({ label, value, icon: Icon, tone }: any) {
  const tones: any = { emerald: 'bg-emerald-50 text-emerald-600', rose: 'bg-rose-50 text-rose-600', blue: 'bg-blue-50 text-blue-600', violet: 'bg-violet-50 text-violet-600' };
  return (<div className="bg-white rounded-xl border border-slate-200 p-4"><div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${tones[tone]}`}><Icon size={16} /></div><p className="text-xs text-slate-500 mb-0.5">{label}</p><p className="text-xl font-bold tabular-nums text-slate-800">{currency(value)}</p></div>);
}

function FilterSelect({ value, onChange, options }: any) {
  return (<div className="relative"><select value={value} onChange={(e) => onChange(e.target.value)} className="appearance-none bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-xs font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-800 cursor-pointer max-w-[160px]">{options.map((o: any) => <option key={o.v} value={o.v}>{o.l}</option>)}</select><ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" /></div>);
}

function BillsPanel({ title, icon: Icon, tone, total, totalLabel, items, onAdd, onToggle, onRemove, doneLabel, renderMeta }: any) {
  const tones: any = { rose: { bg: 'bg-rose-50', text: 'text-rose-600', btn: 'bg-rose-500 hover:bg-rose-400' }, emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', btn: 'bg-emerald-500 hover:bg-emerald-400' } };
  const t = tones[tone];
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3"><div className={`w-9 h-9 rounded-lg flex items-center justify-center ${t.bg} ${t.text}`}><Icon size={16} /></div><div><h3 className="text-sm font-semibold text-slate-700">{title}</h3><p className="text-xs text-slate-400">{totalLabel}: <span className="font-semibold text-slate-600">{currency(total)}</span></p></div></div>
        <button onClick={onAdd} className={`flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors ${t.btn}`}><Plus size={14} /> Adicionar</button>
      </div>
      <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
        {items.length === 0 && <p className="px-5 py-8 text-center text-slate-400 text-sm">Nenhuma conta cadastrada.</p>}
        {items.map((item: any) => {
          const isDone = item.status === doneLabel;
          const dleft = daysUntil(item.vencimento);
          let badge;
          if (isDone) badge = <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md"><CheckCircle2 size={11} /> {doneLabel === 'pago' ? 'Pago' : 'Recebido'}</span>;
          else if (dleft < 0) badge = <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md"><AlertTriangle size={11} /> Atrasado</span>;
          else if (dleft <= 3) badge = <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md"><Clock size={11} /> Vence em {dleft}d</span>;
          else badge = <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md"><Calendar size={11} /> {fmtDate(item.vencimento)}</span>;
          return (
            <div key={item.id} className={`px-5 py-3 flex items-center gap-3 group ${isDone ? 'opacity-60' : ''}`}>
              <button onClick={() => onToggle(item.id)} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isDone ? `${t.text} border-current` : 'border-slate-300'}`}>{isDone && <CheckCircle2 size={14} style={{ color: tone === 'rose' ? '#F43F5E' : '#10B981' }} />}</button>
              <div className="min-w-0 flex-1"><p className={`text-sm font-medium text-slate-700 truncate flex items-center gap-1.5 ${isDone ? 'line-through' : ''}`}>{item.descricao}{item.recorrente && <Repeat size={11} className="text-slate-400 shrink-0" />}</p><div className="flex items-center gap-2 mt-0.5">{badge}{renderMeta && renderMeta(item)}</div></div>
              <span className="text-sm font-bold tabular-nums text-slate-700 shrink-0">{currency(Number(item.valor))}</span>
              <button onClick={() => onRemove(item.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 transition-all shrink-0"><Trash2 size={14} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
