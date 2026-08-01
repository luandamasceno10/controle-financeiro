'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ContaPagar, ContaReceber, Categoria, ContaBancaria, TipoRepeticao, PeriodoRepeticao } from '@/lib/supabase';
import { addByPeriodo, PERIODO_LABEL } from '@/lib/periodo';
import { PAYMENTS } from '@/lib/payments';
import { useToast, ToastContainer } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  Plus, X, Trash2, Wallet, ArrowUpFromLine, ArrowDownToLine,
  AlertTriangle, CheckCircle2, Clock, Calendar, Repeat, Layers, TrendingUp,
} from 'lucide-react';

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function daysUntil(iso: string) {
  const d1 = new Date(todayISO() + 'T00:00:00');
  const d2 = new Date(iso + 'T00:00:00');
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

export default function ContasPagarReceber({ userId }: { userId: string }) {
  const { toasts, addToast, removeToast } = useToast();

  const [payable, setPayable] = useState<ContaPagar[]>([]);
  const [receivable, setReceivable] = useState<ContaReceber[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [loading, setLoading] = useState(true);

  const [showBillForm, setShowBillForm] = useState<'pagar' | 'receber' | null>(null);
  const [savingBill, setSavingBill] = useState(false);
  const [billForm, setBillForm] = useState({
    desc: '', category: '', amount: '', due: todayISO(),
    tipoRepeticao: 'nenhuma' as TipoRepeticao, periodo: 'mensal' as PeriodoRepeticao, parcelas: '2',
  });

  const [settleTarget, setSettleTarget] = useState<{ kind: 'pagar' | 'receber'; id: number } | null>(null);
  const [settlePayment, setSettlePayment] = useState<'pix' | 'cartao'>('pix');
  const [settleContaId, setSettleContaId] = useState<number | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<{ kind: 'pagar' | 'receber'; id: number } | null>(null);

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [pagarResult, receberResult, categoriasResult, contasResult] = await Promise.all([
        supabase.from('contas_pagar').select('*').eq('user_id', userId),
        supabase.from('contas_receber').select('*').eq('user_id', userId),
        supabase.from('categorias').select('*').eq('user_id', userId).eq('ativa', true).order('ordem'),
        supabase.from('contas_bancarias').select('*').eq('user_id', userId).eq('ativa', true),
      ]);
      if (pagarResult.data) setPayable(pagarResult.data);
      if (receberResult.data) setReceivable(receberResult.data);
      if (categoriasResult.data) setCategorias(categoriasResult.data);
      if (contasResult.data) setContasBancarias(contasResult.data);
    } catch (err: any) {
      addToast('Erro ao carregar contas: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const categoriasSaida = useMemo(() => categorias.filter(c => c.tipo === 'saida'), [categorias]);
  const categoriaByName = useMemo(() => {
    const map: Record<string, Categoria> = {};
    categorias.forEach(c => { if (!map[c.nome]) map[c.nome] = c; });
    return map;
  }, [categorias]);
  const catMeta = (nome: string) => categoriaByName[nome];

  const totals = useMemo(() => {
    const aPagar = payable.filter(p => p.status === 'pendente').reduce((s, p) => s + Number(p.valor), 0);
    const aReceber = receivable.filter(r => r.status === 'pendente').reduce((s, r) => s + Number(r.valor), 0);
    return { aPagar, aReceber };
  }, [payable, receivable]);

  const upcomingPayable = useMemo(() => [...payable].sort((a, b) => new Date(a.vencimento).getTime() - new Date(b.vencimento).getTime()), [payable]);
  const upcomingReceivable = useMemo(() => [...receivable].sort((a, b) => new Date(a.vencimento).getTime() - new Date(b.vencimento).getTime()), [receivable]);

  const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  const chartData = useMemo(() => {
    const hoje = new Date();
    const mesAtualKey = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

    const buckets: { key: string; label: string; aPagar: number; aReceber: number }[] = [
      { key: 'atrasado', label: 'Atrasado', aPagar: 0, aReceber: 0 },
    ];
    for (let i = 0; i < 6; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets.push({ key, label: `${MONTH_NAMES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, aPagar: 0, aReceber: 0 });
    }

    const place = (vencimento: string, valor: number, field: 'aPagar' | 'aReceber') => {
      const mesKey = vencimento.slice(0, 7);
      const bucket = mesKey < mesAtualKey ? buckets[0] : buckets.find((b) => b.key === mesKey);
      if (bucket) bucket[field] += valor;
    };

    payable.filter((p) => p.status === 'pendente').forEach((p) => place(p.vencimento, Number(p.valor), 'aPagar'));
    receivable.filter((r) => r.status === 'pendente').forEach((r) => place(r.vencimento, Number(r.valor), 'aReceber'));

    return buckets.filter((b) => b.key === 'atrasado' ? (b.aPagar > 0 || b.aReceber > 0) : true);
  }, [payable, receivable]);

  const openBillForm = (kind: 'pagar' | 'receber') => {
    setBillForm({ desc: '', category: categoriasSaida[0]?.nome || '', amount: '', due: todayISO(), tipoRepeticao: 'nenhuma', periodo: 'mensal', parcelas: '2' });
    setShowBillForm(kind);
  };

  const handleBillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billForm.desc || !billForm.amount) return;

    setSavingBill(true);
    try {
      const table = showBillForm === 'pagar' ? 'contas_pagar' : 'contas_receber';
      const valor = parseFloat(billForm.amount);
      const basePayload: any = {
        user_id: userId,
        descricao: billForm.desc,
        valor,
        status: 'pendente',
        tipo_repeticao: billForm.tipoRepeticao,
        periodo: billForm.periodo,
      };
      if (showBillForm === 'pagar') {
        basePayload.categoria = billForm.category;
        basePayload.categoria_id = categoriaByName[billForm.category]?.id ?? null;
      }

      if (billForm.tipoRepeticao === 'parcelado') {
        const totalParcelas = Math.max(2, parseInt(billForm.parcelas, 10) || 2);
        const rows = [];
        let vencimento = billForm.due;
        for (let i = 1; i <= totalParcelas; i++) {
          rows.push({ ...basePayload, vencimento, parcela_atual: i, parcela_total: totalParcelas });
          vencimento = addByPeriodo(vencimento, billForm.periodo);
        }
        const { error } = await supabase.from(table).insert(rows);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table).insert([{ ...basePayload, vencimento: billForm.due, parcela_atual: null, parcela_total: null }]);
        if (error) throw error;
      }

      await loadData();
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
    setSettleContaId(contasBancarias[0]?.id ?? null);
    setSettleTarget({ kind, id });
  };

  const confirmSettle = async () => {
    if (!settleTarget || !settleContaId) return;
    const { kind, id } = settleTarget;

    try {
      if (kind === 'pagar') {
        const target = payable.find(p => p.id === id);
        if (!target) return;

        const { error: lancError } = await supabase.from('lancamentos').insert([{
          user_id: userId, data: todayISO(), hora: nowTime(), descricao: target.descricao,
          tipo: 'saida', categoria: target.categoria, categoria_id: target.categoria_id,
          forma_pagamento: settlePayment, conta_id: settleContaId, valor: target.valor,
        }]);
        if (lancError) throw lancError;

        await supabase.from('contas_pagar').update({ status: 'pago' }).eq('id', id);

        if (target.tipo_repeticao === 'recorrente') {
          await supabase.from('contas_pagar').insert([{
            user_id: userId, descricao: target.descricao, categoria: target.categoria, categoria_id: target.categoria_id,
            valor: target.valor, vencimento: addByPeriodo(target.vencimento, target.periodo), status: 'pendente',
            tipo_repeticao: 'recorrente', periodo: target.periodo,
          }]);
        }
      } else {
        const target = receivable.find(r => r.id === id);
        if (!target) return;

        const { error: lancError } = await supabase.from('lancamentos').insert([{
          user_id: userId, data: todayISO(), hora: nowTime(), descricao: target.descricao,
          tipo: 'entrada', categoria: 'Diversos', categoria_id: categoriaByName['Diversos']?.id ?? null,
          forma_pagamento: settlePayment, conta_id: settleContaId, valor: target.valor,
        }]);
        if (lancError) throw lancError;

        await supabase.from('contas_receber').update({ status: 'recebido' }).eq('id', id);

        if (target.tipo_repeticao === 'recorrente') {
          await supabase.from('contas_receber').insert([{
            user_id: userId, descricao: target.descricao, valor: target.valor,
            vencimento: addByPeriodo(target.vencimento, target.periodo), status: 'pendente',
            tipo_repeticao: 'recorrente', periodo: target.periodo,
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

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const table = deleteConfirm.kind === 'pagar' ? 'contas_pagar' : 'contas_receber';
      await supabase.from(table).delete().eq('id', deleteConfirm.id);
      await loadData();
      addToast('Conta deletada', 'success');
    } catch (err: any) {
      addToast('Erro ao deletar: ' + err.message, 'error');
    } finally {
      setDeleteConfirm(null);
    }
  };

  return (
    <main className="max-w-4xl mx-auto px-5 py-8 space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
          <Wallet size={16} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Contas a Pagar/Receber</h1>
          <p className="text-xs text-slate-400">Só afeta o saldo quando marcada como paga/recebida</p>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-400">Carregando...</div>
      ) : (
        <>
        {(totals.aPagar > 0 || totals.aReceber > 0) && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center"><TrendingUp size={16} /></div>
              <div>
                <h2 className="text-sm font-semibold text-slate-700">A pagar x a receber ao longo do tempo</h2>
                <p className="text-xs text-slate-400">Pendências por mês de vencimento</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="label" fontSize={11} stroke="#94A3B8" />
                <YAxis tickFormatter={(v: any) => `R$${v}`} fontSize={11} stroke="#94A3B8" />
                <Tooltip formatter={(v: any) => currency(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="aPagar" name="A pagar" fill="#F43F5E" radius={[4, 4, 0, 0]} />
                <Bar dataKey="aReceber" name="A receber" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BillsPanel
            title="Contas a pagar" icon={ArrowUpFromLine} tone="rose" total={totals.aPagar} totalLabel="Em aberto" items={upcomingPayable}
            onAdd={() => openBillForm('pagar')} onToggle={(id: number) => requestSettle('pagar', id)}
            onRemove={(id: number) => setDeleteConfirm({ kind: 'pagar', id })} doneLabel="pago"
            renderMeta={(item: ContaPagar) => <span className="text-[11px] text-slate-400">{catMeta(item.categoria)?.emoji} {item.categoria}</span>}
          />
          <BillsPanel
            title="Contas a receber" icon={ArrowDownToLine} tone="emerald" total={totals.aReceber} totalLabel="Em aberto" items={upcomingReceivable}
            onAdd={() => openBillForm('receber')} onToggle={(id: number) => requestSettle('receber', id)}
            onRemove={(id: number) => setDeleteConfirm({ kind: 'receber', id })} doneLabel="recebido"
          />
        </div>
        </>
      )}

      {showBillForm && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50" onClick={() => setShowBillForm(null)}>
          <div className="bg-white rounded-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-slate-800">Nova conta a {showBillForm === 'pagar' ? 'pagar' : 'receber'}</h3>
              <button onClick={() => setShowBillForm(null)} disabled={savingBill}><X size={18} /></button>
            </div>
            <form onSubmit={handleBillSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Descrição</label>
                <input type="text" value={billForm.desc} onChange={(e) => setBillForm(f => ({ ...f, desc: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" required disabled={savingBill} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Valor (R$)</label>
                  <input type="number" step="0.01" value={billForm.amount} onChange={(e) => setBillForm(f => ({ ...f, amount: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" required disabled={savingBill} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">{billForm.tipoRepeticao === 'parcelado' ? 'Primeiro vencimento' : 'Vencimento'}</label>
                  <input type="date" value={billForm.due} onChange={(e) => setBillForm(f => ({ ...f, due: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" required disabled={savingBill} />
                </div>
              </div>
              {showBillForm === 'pagar' && (
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Categoria</label>
                  <select value={billForm.category} onChange={(e) => setBillForm(f => ({ ...f, category: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white" disabled={savingBill}>
                    {categoriasSaida.map(c => <option key={c.id} value={c.nome}>{c.emoji} {c.nome}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Repetição</label>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => setBillForm(f => ({ ...f, tipoRepeticao: 'nenhuma' }))} className={`py-2 rounded-lg text-xs font-medium border transition-colors ${billForm.tipoRepeticao === 'nenhuma' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>Única</button>
                  <button type="button" onClick={() => setBillForm(f => ({ ...f, tipoRepeticao: 'recorrente' }))} className={`py-2 rounded-lg text-xs font-medium border transition-colors flex items-center justify-center gap-1 ${billForm.tipoRepeticao === 'recorrente' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}><Repeat size={12} /> Recorrente</button>
                  <button type="button" onClick={() => setBillForm(f => ({ ...f, tipoRepeticao: 'parcelado' }))} className={`py-2 rounded-lg text-xs font-medium border transition-colors flex items-center justify-center gap-1 ${billForm.tipoRepeticao === 'parcelado' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}><Layers size={12} /> Parcelado</button>
                </div>
              </div>
              {billForm.tipoRepeticao !== 'nenhuma' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Periodicidade</label>
                    <select value={billForm.periodo} onChange={(e) => setBillForm(f => ({ ...f, periodo: e.target.value as PeriodoRepeticao }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white" disabled={savingBill}>
                      {(['semanal', 'quinzenal', 'mensal'] as PeriodoRepeticao[]).map(p => <option key={p} value={p}>{PERIODO_LABEL[p]}</option>)}
                    </select>
                  </div>
                  {billForm.tipoRepeticao === 'parcelado' && (
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">Nº de parcelas</label>
                      <input type="number" min={2} max={60} value={billForm.parcelas} onChange={(e) => setBillForm(f => ({ ...f, parcelas: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" disabled={savingBill} />
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-slate-400">
                {billForm.tipoRepeticao === 'parcelado'
                  ? 'Todas as parcelas são criadas de uma vez, cada uma com seu vencimento.'
                  : billForm.tipoRepeticao === 'recorrente'
                  ? 'A próxima ocorrência só é criada depois que esta for marcada como paga/recebida.'
                  : 'Lançamento único, sem repetição.'}
              </p>
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
            <div className="grid grid-cols-2 gap-2 mb-5">
              {PAYMENTS.map(p => {
                const Icon = p.icon;
                return (
                  <button key={p.id} type="button" onClick={() => setSettlePayment(p.id as any)} className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-colors ${settlePayment === p.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>
                    <Icon size={15} /> {p.label}
                  </button>
                );
              })}
            </div>
            {contasBancarias.length > 0 ? (
              <div className="mb-5">
                <label className="text-xs font-medium text-slate-500 mb-1 block">{settleTarget.kind === 'pagar' ? 'Debitar da conta' : 'Creditar na conta'}</label>
                <select value={settleContaId ?? ''} onChange={(e) => setSettleContaId(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white">
                  {contasBancarias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            ) : (
              <p className="text-xs text-rose-500 mb-5">Cadastre uma conta bancária antes de quitar esta conta.</p>
            )}
            <div className="flex gap-2">
              <button onClick={() => setSettleTarget(null)} className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600">Cancelar</button>
              <button onClick={confirmSettle} disabled={!settleContaId} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-300 disabled:cursor-not-allowed text-slate-900">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Excluir conta"
        message="Tem certeza que quer excluir esta conta?"
        confirmText="Excluir"
        cancelText="Cancelar"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </main>
  );
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
      <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
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
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium text-slate-700 truncate flex items-center gap-1.5 ${isDone ? 'line-through' : ''}`}>
                  {item.descricao}
                  {item.tipo_repeticao === 'recorrente' && <Repeat size={11} className="text-slate-400 shrink-0" />}
                  {item.tipo_repeticao === 'parcelado' && <span className="text-[10px] font-semibold text-violet-500 shrink-0">{item.parcela_atual}/{item.parcela_total}</span>}
                </p>
                <div className="flex items-center gap-2 mt-0.5">{badge}{renderMeta && renderMeta(item)}</div>
              </div>
              <span className="text-sm font-bold tabular-nums text-slate-700 shrink-0">{currency(Number(item.valor))}</span>
              <button onClick={() => onRemove(item.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 transition-all shrink-0"><Trash2 size={14} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
