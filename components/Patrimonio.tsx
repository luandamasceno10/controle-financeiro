'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Ativo, ContaBancaria, ContaPagar } from '@/lib/supabase';
import { useToast, ToastContainer } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';
import { SkeletonList } from './Skeleton';
import { Plus, X, Pencil, Trash2, PiggyBank, Building2, Car, TrendingUp, CircleEllipsis, Wallet, CreditCard as DebtIcon } from 'lucide-react';

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const TIPO_META: Record<Ativo['tipo'], { label: string; icon: any; cor: string }> = {
  renda_fixa: { label: 'Renda fixa (CDB, Tesouro, poupança)', icon: PiggyBank, cor: '#059669' },
  acoes_fundos: { label: 'Ações e fundos', icon: TrendingUp, cor: '#2563EB' },
  imovel: { label: 'Imóvel', icon: Building2, cor: '#7C3AED' },
  veiculo: { label: 'Veículo', icon: Car, cor: '#EA580C' },
  outro: { label: 'Outro', icon: CircleEllipsis, cor: '#64748B' },
};

export default function Patrimonio({ userId }: { userId: string }) {
  const { toasts, addToast, removeToast } = useToast();

  const [ativos, setAtivos] = useState<Ativo[]>([]);
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [saldoContas, setSaldoContas] = useState(0);
  const [dividas, setDividas] = useState<ContaPagar[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Ativo | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ nome: '', tipo: 'renda_fixa' as Ativo['tipo'], saldo_atual: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<Ativo | null>(null);

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [ativosResult, contasResult, dividasResult, saldoResult] = await Promise.all([
        supabase.from('ativos').select('*').eq('user_id', userId).eq('ativo', true).order('created_at'),
        supabase.from('contas_bancarias').select('*').eq('user_id', userId).eq('ativa', true),
        supabase.from('contas_pagar').select('*').eq('user_id', userId).eq('eh_divida', true).eq('status', 'pendente'),
        supabase.rpc('saldo_por_conta', { p_cutoff: todayISO() }),
      ]);
      if (ativosResult.data) setAtivos(ativosResult.data);
      if (contasResult.data) setContas(contasResult.data);
      if (dividasResult.data) setDividas(dividasResult.data);
      if (saldoResult.data) {
        const base = (contasResult.data || []).reduce((s, c) => s + Number(c.saldo_inicial), 0);
        const soma = saldoResult.data.reduce((s: number, r: { saldo: number }) => s + Number(r.saldo), 0);
        setSaldoContas(base + soma);
      }
    } catch (err: any) {
      addToast('Erro ao carregar patrimônio: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const totalAtivos = useMemo(() => ativos.reduce((s, a) => s + Number(a.saldo_atual), 0), [ativos]);
  const totalDividas = useMemo(() => dividas.reduce((s, d) => s + Number(d.valor), 0), [dividas]);
  const patrimonioLiquido = saldoContas + totalAtivos - totalDividas;

  const openNew = () => {
    setEditing(null);
    setForm({ nome: '', tipo: 'renda_fixa', saldo_atual: '' });
    setShowForm(true);
  };

  const openEdit = (a: Ativo) => {
    setEditing(a);
    setForm({ nome: a.nome, tipo: a.tipo, saldo_atual: String(a.saldo_atual) });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome || form.saldo_atual === '') return;
    setSaving(true);
    try {
      const saldo = parseFloat(form.saldo_atual);
      const payload = { nome: form.nome, tipo: form.tipo, saldo_atual: saldo };
      let ativoId = editing?.id;
      if (editing) {
        const { error } = await supabase.from('ativos').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('ativos').insert([{ ...payload, user_id: userId }]).select().single();
        if (error) throw error;
        ativoId = data.id;
      }
      // Registra o saldo deste mês no histórico — permite reconstruir a
      // evolução patrimonial depois, mesmo que o usuário só atualize "hoje".
      if (ativoId) {
        await supabase.from('ativos_historico').upsert(
          { ativo_id: ativoId, user_id: userId, competencia: todayISO().slice(0, 7), saldo },
          { onConflict: 'ativo_id,competencia' }
        );
      }
      addToast(editing ? 'Ativo atualizado!' : 'Ativo adicionado!', 'success');
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
      await supabase.from('ativos').update({ ativo: false }).eq('id', deleteConfirm.id);
      await loadData();
      addToast('Ativo removido', 'success');
    } catch (err: any) {
      addToast('Erro ao remover: ' + err.message, 'error');
    } finally {
      setDeleteConfirm(null);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-5 py-8 space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <PiggyBank size={16} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Patrimônio</h1>
            <p className="text-xs text-slate-400 dark:text-slate-500">Contas + investimentos e bens − dívidas em aberto</p>
          </div>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors">
          <Plus size={16} strokeWidth={2.5} /> Novo ativo
        </button>
      </div>

      {!loading && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Patrimônio líquido</p>
          <p className={`text-2xl font-bold tabular-nums mb-4 ${patrimonioLiquido >= 0 ? 'text-slate-800 dark:text-slate-100' : 'text-rose-600'}`}>{currency(patrimonioLiquido)}</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="w-8 h-8 rounded-lg bg-cyan-50 dark:bg-cyan-500/10 flex items-center justify-center mx-auto mb-1.5"><Wallet size={14} className="text-cyan-600" /></div>
              <p className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">{currency(saldoContas)}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">Contas bancárias</p>
            </div>
            <div>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto mb-1.5"><PiggyBank size={14} className="text-emerald-600" /></div>
              <p className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">{currency(totalAtivos)}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">Ativos</p>
            </div>
            <div>
              <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center mx-auto mb-1.5"><DebtIcon size={14} className="text-rose-600" /></div>
              <p className="text-sm font-bold tabular-nums text-rose-600">{currency(totalDividas)}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">Dívidas em aberto</p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"><SkeletonList /></div>
      ) : ativos.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-10 text-center">
          <div className="w-12 h-12 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto mb-4">
            <PiggyBank size={22} />
          </div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Nenhum ativo cadastrado</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">Cadastre investimentos, imóveis ou veículos pra ver seu patrimônio líquido de verdade, não só o saldo em conta.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ativos.map((a) => {
            const meta = TIPO_META[a.tipo];
            const Icon = meta.icon;
            return (
              <div key={a.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${meta.cor}15`, color: meta.cor }}>
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{a.nome}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{meta.label}</p>
                </div>
                <p className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200 shrink-0">{currency(Number(a.saldo_atual))}</p>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(a)} className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"><Pencil size={15} /></button>
                  <button onClick={() => setDeleteConfirm(a)} className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">{editing ? 'Editar ativo' : 'Novo ativo'}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Nome</label>
                <input type="text" value={form.nome} onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Tesouro Selic, Apartamento" className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100" required disabled={saving} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Tipo</label>
                <select value={form.tipo} onChange={(e) => setForm(f => ({ ...f, tipo: e.target.value as Ativo['tipo'] }))} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-800" disabled={saving}>
                  {(Object.keys(TIPO_META) as Ativo['tipo'][]).map((t) => <option key={t} value={t}>{TIPO_META[t].label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Saldo atual (R$)</label>
                <input type="number" step="0.01" value={form.saldo_atual} onChange={(e) => setForm(f => ({ ...f, saldo_atual: e.target.value }))} placeholder="0,00" className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100" required disabled={saving} />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Atualize aqui sempre que quiser — cada atualização fica guardada como o saldo deste mês.</p>
              </div>
              <button type="submit" disabled={saving} className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-400 text-slate-900 font-semibold py-2.5 rounded-lg text-sm transition-colors">
                {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Adicionar ativo'}
              </button>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirm !== null}
        title="Remover ativo"
        message={`Tem certeza que quer remover "${deleteConfirm?.nome}"? O histórico de saldos dele é mantido, só some da lista.`}
        confirmText="Remover"
        cancelText="Cancelar"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </main>
  );
}
