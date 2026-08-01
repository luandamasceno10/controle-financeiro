'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { CartaoCredito, Fatura, Lancamento, ContaBancaria } from '@/lib/supabase';
import { useToast, ToastContainer } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';
import { Plus, X, Pencil, Trash2, CreditCard, Check } from 'lucide-react';

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

export default function CartoesCredito({ userId }: { userId: string }) {
  const { toasts, addToast, removeToast } = useToast();
  const [cartoes, setCartoes] = useState<CartaoCredito[]>([]);
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [entries, setEntries] = useState<Lancamento[]>([]);
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CartaoCredito | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ nome: '', dia_fechamento: '1', dia_vencimento: '10' });
  const [deleteConfirm, setDeleteConfirm] = useState<CartaoCredito | null>(null);

  const [selectedCartao, setSelectedCartao] = useState<CartaoCredito | null>(null);
  const [payFatura, setPayFatura] = useState<Fatura | null>(null);
  const [payContaId, setPayContaId] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [cartoesResult, faturasResult, entriesResult, contasResult] = await Promise.all([
        supabase.from('cartoes_credito').select('*').eq('user_id', userId).order('id'),
        supabase.from('faturas').select('*').eq('user_id', userId),
        supabase.from('lancamentos').select('*').eq('user_id', userId).not('cartao_id', 'is', null),
        supabase.from('contas_bancarias').select('*').eq('user_id', userId).eq('ativa', true),
      ]);
      if (cartoesResult.data) setCartoes(cartoesResult.data);
      if (faturasResult.data) setFaturas(faturasResult.data);
      if (entriesResult.data) setEntries(entriesResult.data as Lancamento[]);
      if (contasResult.data) setContas(contasResult.data);
    } catch (err: any) {
      addToast('Erro ao carregar cartões: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const cartoesAtivos = useMemo(() => cartoes.filter((c) => c.ativo), [cartoes]);

  const faturaAbertaDoCartao = (cartaoId: number) =>
    faturas.filter((f) => f.cartao_id === cartaoId && f.status === 'aberta').sort((a, b) => b.competencia.localeCompare(a.competencia))[0] || null;

  const totalDaFatura = (faturaId: number) =>
    entries.filter((e) => e.fatura_id === faturaId).reduce((s, e) => s + Number(e.valor), 0);

  const openNew = () => {
    setEditing(null);
    setForm({ nome: '', dia_fechamento: '1', dia_vencimento: '10' });
    setShowForm(true);
  };

  const openEdit = (cartao: CartaoCredito) => {
    setEditing(cartao);
    setForm({ nome: cartao.nome, dia_fechamento: String(cartao.dia_fechamento), dia_vencimento: String(cartao.dia_vencimento) });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome) return;

    setSaving(true);
    try {
      const payload = {
        nome: form.nome,
        dia_fechamento: parseInt(form.dia_fechamento, 10),
        dia_vencimento: parseInt(form.dia_vencimento, 10),
      };
      if (editing) {
        const { error } = await supabase.from('cartoes_credito').update(payload).eq('id', editing.id);
        if (error) throw error;
        addToast('Cartão atualizado!', 'success');
      } else {
        const { error } = await supabase.from('cartoes_credito').insert([{ ...payload, user_id: userId }]);
        if (error) throw error;
        addToast('Cartão criado!', 'success');
      }
      await loadData();
      setShowForm(false);
    } catch (err: any) {
      addToast('Erro ao salvar: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await supabase.from('cartoes_credito').update({ ativo: false }).eq('id', deleteConfirm.id);
      await loadData();
      addToast('Cartão removido', 'success');
    } catch (err: any) {
      addToast('Erro ao remover: ' + err.message, 'error');
    } finally {
      setDeleteConfirm(null);
    }
  };

  const openPayFatura = (fatura: Fatura) => {
    setPayFatura(fatura);
    setPayContaId(contas[0]?.id ?? null);
  };

  const confirmPayFatura = async () => {
    if (!payFatura || !payContaId || !selectedCartao) return;
    setPaying(true);
    try {
      const total = totalDaFatura(payFatura.id);
      const { error: insertError } = await supabase.from('lancamentos').insert([{
        user_id: userId,
        conta_id: payContaId,
        data: todayISO(),
        hora: nowTime(),
        descricao: `Fatura ${selectedCartao.nome} — ${payFatura.competencia}`,
        tipo: 'saida',
        categoria: 'Cartão de crédito',
        forma_pagamento: 'pix',
        valor: total,
      }]);
      if (insertError) throw insertError;

      const { error: updateError } = await supabase.from('faturas').update({ status: 'paga' }).eq('id', payFatura.id);
      if (updateError) throw updateError;

      addToast('Fatura paga!', 'success');
      setPayFatura(null);
      await loadData();
    } catch (err: any) {
      addToast('Erro ao pagar fatura: ' + err.message, 'error');
    } finally {
      setPaying(false);
    }
  };

  const cartaoEntries = (cartaoId: number) =>
    entries.filter((e) => e.cartao_id === cartaoId).sort((a, b) => (b.data + (b.hora || '')).localeCompare(a.data + (a.hora || '')));

  return (
    <main className="max-w-2xl mx-auto px-5 py-8 space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
            <CreditCard size={16} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Cartões de Crédito</h1>
            <p className="text-xs text-slate-400">Compras no cartão só afetam o saldo quando a fatura é paga</p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus size={16} strokeWidth={2.5} /> Novo cartão
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-400">Carregando...</div>
      ) : cartoesAtivos.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-400">Nenhum cartão cadastrado ainda.</div>
      ) : (
        <div className="space-y-3">
          {cartoesAtivos.map((cartao) => {
            const fatura = faturaAbertaDoCartao(cartao.id);
            const total = fatura ? totalDaFatura(fatura.id) : 0;
            const isSelected = selectedCartao?.id === cartao.id;
            return (
              <div key={cartao.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3.5">
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => setSelectedCartao(isSelected ? null : cartao)}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: cartao.cor + '20', color: cartao.cor }}>
                      <CreditCard size={14} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{cartao.nome}</p>
                      <p className="text-xs text-slate-400">Fecha dia {cartao.dia_fechamento} · Vence dia {cartao.dia_vencimento}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Fatura aberta</p>
                      <p className="text-sm font-semibold text-slate-800">{currency(total)}</p>
                    </div>
                    <button onClick={() => openEdit(cartao)} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><Pencil size={15} /></button>
                    <button onClick={() => setDeleteConfirm(cartao)} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 size={15} /></button>
                  </div>
                </div>

                {fatura && total > 0 && (
                  <div className="px-4 pb-3">
                    <button
                      onClick={() => { setSelectedCartao(cartao); openPayFatura(fatura); }}
                      disabled={contas.length === 0}
                      className="w-full flex items-center justify-center gap-2 bg-violet-500 hover:bg-violet-400 disabled:bg-slate-300 text-white font-semibold text-xs px-3 py-2 rounded-lg transition-colors"
                    >
                      <Check size={14} /> Pagar fatura de {fatura.competencia}
                    </button>
                  </div>
                )}

                {isSelected && (
                  <div className="border-t border-slate-100 divide-y divide-slate-100">
                    {cartaoEntries(cartao.id).length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">Nenhuma compra lançada neste cartão ainda.</div>
                    ) : (
                      cartaoEntries(cartao.id).map((e) => (
                        <div key={e.id} className="flex items-center justify-between px-4 py-2.5">
                          <div className="min-w-0">
                            <p className="text-sm text-slate-700 truncate">{e.descricao}</p>
                            <p className="text-xs text-slate-400">{fmtDate(e.data)} · {e.categoria}</p>
                          </div>
                          <span className="text-sm font-semibold text-rose-600 shrink-0">-{currency(Number(e.valor))}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-slate-800">{editing ? 'Editar cartão' : 'Novo cartão de crédito'}</h3>
              <button onClick={() => setShowForm(false)} disabled={saving}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Nome</label>
                <input type="text" value={form.nome} onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Nubank, Inter" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" required disabled={saving} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Dia de fechamento</label>
                  <input type="number" min={1} max={31} value={form.dia_fechamento} onChange={(e) => setForm(f => ({ ...f, dia_fechamento: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" required disabled={saving} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Dia de vencimento</label>
                  <input type="number" min={1} max={31} value={form.dia_vencimento} onChange={(e) => setForm(f => ({ ...f, dia_vencimento: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" required disabled={saving} />
                </div>
              </div>
              <button type="submit" disabled={saving} className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-400 text-slate-900 font-semibold py-2.5 rounded-lg text-sm transition-colors">
                {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar cartão'}
              </button>
            </form>
          </div>
        </div>
      )}

      {payFatura && selectedCartao && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-slate-800">Pagar fatura</h3>
              <button onClick={() => setPayFatura(null)} disabled={paying}><X size={18} /></button>
            </div>
            <p className="text-sm text-slate-600 mb-1">{selectedCartao.nome} · {payFatura.competencia}</p>
            <p className="text-2xl font-bold text-slate-800 mb-4">{currency(totalDaFatura(payFatura.id))}</p>
            <div className="mb-4">
              <label className="text-xs font-medium text-slate-500 mb-1 block">Debitar da conta</label>
              <select value={payContaId ?? ''} onChange={(e) => setPayContaId(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white" disabled={paying}>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <button onClick={confirmPayFatura} disabled={paying || !payContaId} className="w-full bg-violet-500 hover:bg-violet-400 disabled:bg-slate-400 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors">
              {paying ? 'Pagando...' : 'Confirmar pagamento'}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Remover cartão"
        message={`Tem certeza que deseja remover "${deleteConfirm?.nome}"? Lançamentos antigos continuam vinculados a ele para fins de histórico.`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
        confirmText="Remover"
        danger
      />
    </main>
  );
}
