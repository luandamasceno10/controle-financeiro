'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { LancamentoRecorrente, Categoria, ContaBancaria, CartaoCredito } from '@/lib/supabase';
import { ensureRecorrentesGerados } from '@/lib/recorrentes';
import { PAYMENTS } from '@/lib/payments';
import { useToast, ToastContainer } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';
import { Plus, X, Pencil, Trash2, Repeat } from 'lucide-react';

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function LancamentosRecorrentes({ userId }: { userId: string }) {
  const { toasts, addToast, removeToast } = useToast();

  const [recorrentes, setRecorrentes] = useState<LancamentoRecorrente[]>([]);
  const [categoriasEntrada, setCategoriasEntrada] = useState<Categoria[]>([]);
  const [categoriasSaida, setCategoriasSaida] = useState<Categoria[]>([]);
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [cartoes, setCartoes] = useState<CartaoCredito[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LancamentoRecorrente | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<LancamentoRecorrente | null>(null);

  const [form, setForm] = useState({
    desc: '', tipo: 'saida' as 'entrada' | 'saida', categoria: '',
    payment: 'pix' as 'pix' | 'cartao', valor: '', dia_mes: '5',
    conta_id: null as number | null, cartao_id: null as number | null,
    data_inicio: todayISO(), data_fim: '',
  });

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    try {
      setLoading(true);
      await ensureRecorrentesGerados(userId);
      const [recResult, catResult, contasResult, cartoesResult] = await Promise.all([
        supabase.from('lancamentos_recorrentes').select('*').eq('user_id', userId).order('dia_mes'),
        supabase.from('categorias').select('*').eq('user_id', userId).eq('ativa', true).order('ordem'),
        supabase.from('contas_bancarias').select('*').eq('user_id', userId).eq('ativa', true),
        supabase.from('cartoes_credito').select('*').eq('user_id', userId).eq('ativo', true),
      ]);
      if (recResult.data) setRecorrentes(recResult.data);
      if (catResult.data) {
        setCategoriasEntrada(catResult.data.filter((c: Categoria) => c.tipo === 'entrada'));
        setCategoriasSaida(catResult.data.filter((c: Categoria) => c.tipo === 'saida'));
      }
      if (contasResult.data) setContas(contasResult.data);
      if (cartoesResult.data) setCartoes(cartoesResult.data);
    } catch (err: any) {
      addToast('Erro ao carregar recorrentes: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const categoriaOptions = form.tipo === 'entrada' ? categoriasEntrada : categoriasSaida;
  const categoriaByName = useMemo(() => {
    const map: Record<string, Categoria> = {};
    [...categoriasEntrada, ...categoriasSaida].forEach((c) => { map[c.nome] = c; });
    return map;
  }, [categoriasEntrada, categoriasSaida]);

  const openNew = () => {
    setEditing(null);
    setForm({
      desc: '', tipo: 'saida', categoria: categoriasSaida[0]?.nome || '',
      payment: 'pix', valor: '', dia_mes: '5',
      conta_id: contas[0]?.id ?? null, cartao_id: cartoes[0]?.id ?? null,
      data_inicio: todayISO(), data_fim: '',
    });
    setShowForm(true);
  };

  const openEdit = (r: LancamentoRecorrente) => {
    setEditing(r);
    setForm({
      desc: r.descricao, tipo: r.tipo, categoria: r.categoria,
      payment: r.forma_pagamento, valor: String(r.valor), dia_mes: String(r.dia_mes),
      conta_id: r.conta_id ?? contas[0]?.id ?? null, cartao_id: r.cartao_id ?? cartoes[0]?.id ?? null,
      data_inicio: r.data_inicio, data_fim: r.data_fim || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.desc || !form.valor) return;

    setSaving(true);
    try {
      const payload = {
        descricao: form.desc,
        tipo: form.tipo,
        categoria: form.categoria,
        categoria_id: categoriaByName[form.categoria]?.id ?? null,
        forma_pagamento: form.payment,
        conta_id: form.payment === 'cartao' ? null : form.conta_id,
        cartao_id: form.payment === 'cartao' ? form.cartao_id : null,
        valor: parseFloat(form.valor),
        dia_mes: parseInt(form.dia_mes, 10),
        data_inicio: form.data_inicio,
        data_fim: form.data_fim || null,
      };
      if (editing) {
        const { error } = await supabase.from('lancamentos_recorrentes').update(payload).eq('id', editing.id);
        if (error) throw error;
        addToast('Recorrência atualizada!', 'success');
      } else {
        const { error } = await supabase.from('lancamentos_recorrentes').insert([{ ...payload, user_id: userId }]);
        if (error) throw error;
        addToast('Recorrência criada!', 'success');
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
      await supabase.from('lancamentos_recorrentes').update({ ativo: false }).eq('id', deleteConfirm.id);
      await loadData();
      addToast('Recorrência desativada', 'success');
    } catch (err: any) {
      addToast('Erro ao desativar: ' + err.message, 'error');
    } finally {
      setDeleteConfirm(null);
    }
  };

  const ativos = useMemo(() => recorrentes.filter((r) => r.ativo), [recorrentes]);

  return (
    <main className="max-w-2xl mx-auto px-5 py-8 space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
            <Repeat size={16} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Lançamentos Recorrentes</h1>
            <p className="text-xs text-slate-400">Salário, aluguel, assinaturas — lançados automaticamente todo mês</p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus size={16} strokeWidth={2.5} /> Nova recorrência
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Carregando...</div>
        ) : ativos.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Nenhum lançamento recorrente cadastrado ainda.</div>
        ) : (
          ativos.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition-colors">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-700 truncate">{r.descricao}</p>
                <p className="text-xs text-slate-400">Todo dia {r.dia_mes} · {r.forma_pagamento === 'pix' ? 'Pix' : 'Cartão'} · {r.categoria}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-sm font-semibold ${r.tipo === 'entrada' ? 'text-emerald-600' : 'text-slate-800'}`}>
                  {r.tipo === 'entrada' ? '+' : '-'}{currency(Number(r.valor))}
                </span>
                <button onClick={() => openEdit(r)} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><Pencil size={15} /></button>
                <button onClick={() => setDeleteConfirm(r)} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 size={15} /></button>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-slate-800">{editing ? 'Editar recorrência' : 'Nova recorrência'}</h3>
              <button onClick={() => setShowForm(false)} disabled={saving}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setForm(f => ({ ...f, tipo: 'entrada', categoria: categoriasEntrada[0]?.nome || '', payment: 'pix' }))} className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.tipo === 'entrada' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-600 border-slate-200'}`}>Entrada</button>
                <button type="button" onClick={() => setForm(f => ({ ...f, tipo: 'saida', categoria: categoriasSaida[0]?.nome || '' }))} className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.tipo === 'saida' ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-slate-600 border-slate-200'}`}>Saída</button>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Descrição</label>
                <input type="text" value={form.desc} onChange={(e) => setForm(f => ({ ...f, desc: e.target.value }))} placeholder="Ex: Salário, Aluguel, Netflix" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" required disabled={saving} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Valor (R$)</label>
                  <input type="number" step="0.01" value={form.valor} onChange={(e) => setForm(f => ({ ...f, valor: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" required disabled={saving} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Todo dia</label>
                  <input type="number" min={1} max={28} value={form.dia_mes} onChange={(e) => setForm(f => ({ ...f, dia_mes: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" required disabled={saving} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Categoria</label>
                <select value={form.categoria} onChange={(e) => setForm(f => ({ ...f, categoria: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white" disabled={saving}>
                  {categoriaOptions.map(c => <option key={c.id} value={c.nome}>{c.emoji} {c.nome}</option>)}
                </select>
              </div>
              {form.tipo === 'saida' && (
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Forma de pagamento</label>
                  <div className="grid grid-cols-2 gap-2">
                    {PAYMENTS.map(p => {
                      const Icon = p.icon;
                      const disabledOpt = p.id === 'cartao' && cartoes.length === 0;
                      return (
                        <button key={p.id} type="button" onClick={() => !disabledOpt && setForm(f => ({ ...f, payment: p.id as any }))} disabled={saving || disabledOpt} className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40 ${form.payment === p.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>
                          <Icon size={15} /> {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {form.tipo === 'saida' && form.payment === 'cartao' ? (
                cartoes.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Cartão de crédito</label>
                    <select value={form.cartao_id ?? ''} onChange={(e) => setForm(f => ({ ...f, cartao_id: Number(e.target.value) }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white" disabled={saving}>
                      {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </div>
                )
              ) : (
                contas.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Conta bancária</label>
                    <select value={form.conta_id ?? ''} onChange={(e) => setForm(f => ({ ...f, conta_id: Number(e.target.value) }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white" disabled={saving}>
                      {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </div>
                )
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Começa em</label>
                  <input type="date" value={form.data_inicio} onChange={(e) => setForm(f => ({ ...f, data_inicio: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" disabled={saving} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Termina em (opcional)</label>
                  <input type="date" value={form.data_fim} onChange={(e) => setForm(f => ({ ...f, data_fim: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" disabled={saving} />
                </div>
              </div>
              <button type="submit" disabled={saving} className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-400 text-slate-900 font-semibold py-2.5 rounded-lg text-sm transition-colors">
                {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar recorrência'}
              </button>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Desativar recorrência"
        message={`Tem certeza que deseja desativar "${deleteConfirm?.descricao}"? Lançamentos já gerados continuam no histórico; nenhum novo será criado.`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
        confirmText="Desativar"
        danger
      />
    </main>
  );
}
