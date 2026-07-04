'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { Lancamento, ContaPagar, ContaReceber, Previsao } from '@/lib/supabase';
import { useToast, ToastContainer } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line
} from 'recharts';
import {
  Plus, Wallet, CreditCard, QrCode, ChevronDown, X, Trash2,
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
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('mensal');
  
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [showForm, setShowForm] = useState(false);
  const [showBillForm, setShowBillForm] = useState<'pagar' | 'receber' | null>(null);
  const [showCardDetail, setShowCardDetail] = useState(false);
  const [settleTarget, setSettleTarget] = useState<{ kind: 'pagar' | 'receber'; id: number } | null>(null);
  const [settlePayment, setSettlePayment] = useState<'pix' | 'cartao'>('pix');
  const [editingForecast, setEditingForecast] = useState(false);
  const [forecastInput, setForecastInput] = useState('');
  
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
      const [lancResult, pagarResult, receberResult, previsaoResult] = await Promise.all([
        supabase.from('lancamentos').select('*').eq('user_id', userId),
        supabase.from('contas_pagar').select('*').eq('user_id', userId),
        supabase.from('contas_receber').select('*').eq('user_id', userId),
        supabase.from('previsoes').select('*').eq('user_id', userId),
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
    let acc = 0;
    for (let m = 1; m < month; m++) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      const me = entries.filter(e => monthKey(e.data) === key);
      const ent = me.filter(e => e.tipo === 'entrada').reduce((s, e) => s + Number(e.valor), 0);
      const sai = me.filter(e => e.tipo === 'saida').reduce((s, e) => s + Number(e.valor), 0);
      acc += (ent - sai);
    }
    return acc;
  }, [entries, currentMonth]);

  const commitment = useMemo(() => {
    const prevCarry = carryOver - totals.saldo;
    const forecastValue = forecast[currentMonth] || 0;
    const disponivel = prevCarry + forecastValue;
    const pct = disponivel > 0 ? Math.min(Math.round((totals.saida / disponivel) * 100), 999) : null;
    return { disponivel, prevCarry, forecastValue, pct, gasto: totals.saida };
  }, [carryOver, totals, forecast, currentMonth]);

  const billTotals = useMemo(() => {
    const aPagar = payable.filter(p => p.status === 'pendente').reduce((s, p) => s + Number(p.valor), 0);
    const aReceber = receivable.filter(r => r.status === 'pendente').reduce((s, r) => s + Number(r.valor), 0);
    const saldoProjetado = totals.saldo + aReceber - aPagar;
    return { aPagar, aReceber, saldoProjetado };
  }, [payable, receivable, totals.saldo]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.desc || !form.amount) return;

    setSavingForm(true);
    try {
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
      await loadData();
      setForm({ desc: '', type: 'saida', category: 'Moradia', payment: 'pix', amount: '', date: todayISO() });
      setShowForm(false);
      addToast('Lançamento salvo com sucesso!', 'success');
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const monthIdx = MONTH_NAMES.findIndex((_, i) => currentMonth === `${currentYear}-${String(i + 1).padStart(2, '0')}`);
  const isEmpty = entries.length === 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-600"><Loader size={18} className="animate-spin" /> Carregando dados...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
onSubmit={handleBillSubmit} className="space-y-4">
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
            <div className="grid grid-cols-2 gap-2 mb-5">{PAYMENTS.map(p => { const
