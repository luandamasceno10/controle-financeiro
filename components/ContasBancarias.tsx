'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ContaBancaria, Lancamento, Categoria, ContaReceber } from '@/lib/supabase';
import { BANCOS, bancoMeta } from '@/lib/bancos';
import { BancoIcon } from './BancoIcon';
import ConciliacaoBancaria from './ConciliacaoBancaria';
import { useToast, ToastContainer } from './Toast';
import { SkeletonList } from './Skeleton';
import { ConfirmDialog } from './ConfirmDialog';
import { Plus, X, Pencil, Trash2, Landmark, FileUp } from 'lucide-react';

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function ContasBancarias({ userId }: { userId: string }) {
  const { toasts, addToast, removeToast } = useToast();
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [entries, setEntries] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ContaBancaria | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ nome: '', banco: BANCOS[0].nome, saldo_inicial: '' });

  const [deleteConfirm, setDeleteConfirm] = useState<ContaBancaria | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [receivable, setReceivable] = useState<ContaReceber[]>([]);
  const [conciliando, setConciliando] = useState<ContaBancaria | null>(null);

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [contasResult, entriesResult, categoriasResult, receberResult] = await Promise.all([
        supabase.from('contas_bancarias').select('*').eq('user_id', userId).order('id'),
        supabase.from('lancamentos').select('*').eq('user_id', userId),
        supabase.from('categorias').select('*').eq('user_id', userId).eq('ativa', true).order('ordem'),
        supabase.from('contas_receber').select('*').eq('user_id', userId).eq('status', 'pendente'),
      ]);
      if (contasResult.data) setContas(contasResult.data);
      if (entriesResult.data) setEntries(entriesResult.data as Lancamento[]);
      if (categoriasResult.data) setCategorias(categoriasResult.data);
      if (receberResult.data) setReceivable(receberResult.data);
    } catch (err: any) {
      addToast('Erro ao carregar contas: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const saldoDaConta = (contaId: number, saldoInicial: number) => {
    const sum = entries
      .filter((e) => e.conta_id === contaId)
      .reduce((s, e) => s + (e.tipo === 'entrada' ? Number(e.valor) : -Number(e.valor)), 0);
    return saldoInicial + sum;
  };

  const contasAtivas = useMemo(() => contas.filter((c) => c.ativa), [contas]);
  const saldoTotal = useMemo(
    () => contasAtivas.reduce((s, c) => s + saldoDaConta(c.id, c.saldo_inicial), 0),
    [contasAtivas, entries]
  );

  const openNew = () => {
    setEditing(null);
    setForm({ nome: '', banco: BANCOS[0].nome, saldo_inicial: '' });
    setShowForm(true);
  };

  const openEdit = (conta: ContaBancaria) => {
    setEditing(conta);
    setForm({ nome: conta.nome, banco: conta.banco || BANCOS[0].nome, saldo_inicial: String(conta.saldo_inicial) });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome || form.saldo_inicial === '') return;

    setSaving(true);
    try {
      const meta = bancoMeta(form.banco);
      const payload = {
        nome: form.nome,
        banco: form.banco,
        cor: meta.cor,
        saldo_inicial: parseFloat(form.saldo_inicial),
      };
      if (editing) {
        const { error } = await supabase.from('contas_bancarias').update(payload).eq('id', editing.id);
        if (error) throw error;
        addToast('Conta atualizada!', 'success');
      } else {
        const { error } = await supabase.from('contas_bancarias').insert([{ ...payload, user_id: userId }]);
        if (error) throw error;
        addToast('Conta criada!', 'success');
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
      await supabase.from('contas_bancarias').update({ ativa: false }).eq('id', deleteConfirm.id);
      await loadData();
      addToast('Conta removida', 'success');
    } catch (err: any) {
      addToast('Erro ao remover: ' + err.message, 'error');
    } finally {
      setDeleteConfirm(null);
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-5 py-8 space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 flex items-center justify-center">
            <Landmark size={16} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Contas Bancárias</h1>
            <p className="text-xs text-slate-400 dark:text-slate-500">Saldo por conta, somado no total do dashboard</p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus size={16} strokeWidth={2.5} /> Nova conta
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Saldo total</p>
        <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{loading ? '—' : currency(saldoTotal)}</p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
        {loading ? (
          <SkeletonList />
        ) : contasAtivas.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400 dark:text-slate-500">Nenhuma conta cadastrada ainda.</div>
        ) : (
          contasAtivas.map((conta) => {
            return (
              <div key={conta.id} className="flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                <div className="flex items-center gap-3">
                  <BancoIcon nome={conta.banco || conta.nome} size={32} />
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{conta.nome}</p>
                    {conta.banco && <p className="text-xs text-slate-400 dark:text-slate-500">{conta.banco}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{currency(saldoDaConta(conta.id, conta.saldo_inicial))}</span>
                  <button onClick={() => setConciliando(conta)} title="Conciliar extrato" className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-blue-600 hover:bg-blue-50"><FileUp size={15} /></button>
                  <button onClick={() => openEdit(conta)} className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"><Pencil size={15} /></button>
                  <button onClick={() => setDeleteConfirm(conta)} className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-rose-600 hover:bg-rose-50"><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">{editing ? 'Editar conta' : 'Nova conta bancária'}</h3>
              <button onClick={() => setShowForm(false)} disabled={saving}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Apelido</label>
                <input type="text" value={form.nome} onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Conta principal, Reserva" className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100" required disabled={saving} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Banco</label>
                <select value={form.banco} onChange={(e) => setForm(f => ({ ...f, banco: e.target.value }))} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-800" disabled={saving}>
                  {BANCOS.map(b => <option key={b.nome} value={b.nome}>{b.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
                  {editing ? 'Saldo inicial' : 'Saldo desta conta hoje'}
                </label>
                <input type="number" step="0.01" value={form.saldo_inicial} onChange={(e) => setForm(f => ({ ...f, saldo_inicial: e.target.value }))} placeholder="0,00" className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100" required disabled={saving} />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">O app passa a contabilizar a partir daqui — lançamentos futuros somam ou subtraem deste valor.</p>
              </div>
              <button type="submit" disabled={saving} className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-400 text-slate-900 font-semibold py-2.5 rounded-lg text-sm transition-colors">
                {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar conta'}
              </button>
            </form>
          </div>
        </div>
      )}

      {conciliando && (
        <ConciliacaoBancaria
          userId={userId}
          conta={conciliando}
          entries={entries}
          categorias={categorias}
          receivable={receivable}
          onClose={() => setConciliando(null)}
          onCreated={loadData}
        />
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Remover conta"
        message={`Tem certeza que deseja remover "${deleteConfirm?.nome}"? Lançamentos antigos continuam vinculados a ela para fins de histórico.`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
        confirmText="Remover"
        danger
      />
    </main>
  );
}
