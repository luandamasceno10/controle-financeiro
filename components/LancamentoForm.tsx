'use client';

import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Lancamento, Categoria, ContaBancaria } from '@/lib/supabase';
import { PAYMENTS } from '@/lib/payments';
import { X, Trash2 } from 'lucide-react';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

export default function LancamentoForm({
  userId,
  categoriasEntrada,
  categoriasSaida,
  contas,
  editingEntry,
  onClose,
  onSaved,
  onRequestDelete,
  onError,
}: {
  userId: string;
  categoriasEntrada: Categoria[];
  categoriasSaida: Categoria[];
  contas: ContaBancaria[];
  editingEntry: Lancamento | null;
  onClose: () => void;
  onSaved: () => void;
  onRequestDelete?: (id: number) => void;
  onError?: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => {
    if (editingEntry) {
      return {
        desc: editingEntry.descricao,
        type: editingEntry.tipo,
        category: editingEntry.categoria,
        payment: editingEntry.forma_pagamento,
        amount: String(editingEntry.valor),
        date: editingEntry.data,
        hora: editingEntry.hora ? editingEntry.hora.slice(0, 5) : '00:00',
        conta_id: editingEntry.conta_id ?? contas[0]?.id ?? null,
      };
    }
    return {
      desc: '', type: 'saida' as 'entrada' | 'saida', category: categoriasSaida[0]?.nome || '',
      payment: 'pix' as 'pix' | 'cartao', amount: '', date: todayISO(), hora: nowTime(),
      conta_id: contas[0]?.id ?? null,
    };
  });

  const categoriaByName = useMemo(() => {
    const map: Record<string, Categoria> = {};
    [...categoriasEntrada, ...categoriasSaida].forEach((c) => { map[c.nome] = c; });
    return map;
  }, [categoriasEntrada, categoriasSaida]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.desc || !form.amount) return;

    setSaving(true);
    try {
      const categoriaId = categoriaByName[form.category]?.id ?? null;
      const payload = {
        data: form.date,
        hora: form.hora,
        descricao: form.desc,
        tipo: form.type,
        categoria: form.category,
        categoria_id: categoriaId,
        forma_pagamento: form.payment,
        conta_id: form.conta_id,
        valor: parseFloat(form.amount),
      };
      if (editingEntry) {
        const { error } = await supabase.from('lancamentos').update(payload).eq('id', editingEntry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('lancamentos').insert([{ ...payload, user_id: userId }]);
        if (error) throw error;
      }
      onSaved();
    } catch (err: any) {
      onError?.('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const categoriaOptions = form.type === 'entrada' ? categoriasEntrada : categoriasSaida;

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-slate-800">{editingEntry ? 'Editar lançamento' : 'Novo lançamento'}</h3>
          <button onClick={onClose} disabled={saving}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setForm(f => ({ ...f, type: 'entrada', category: categoriasEntrada[0]?.nome || '' }))} className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.type === 'entrada' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-600 border-slate-200'}`}>Entrada</button>
            <button type="button" onClick={() => setForm(f => ({ ...f, type: 'saida', category: categoriasSaida[0]?.nome || '' }))} className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.type === 'saida' ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-slate-600 border-slate-200'}`}>Saída</button>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Descrição</label>
            <input type="text" value={form.desc} onChange={(e) => setForm(f => ({ ...f, desc: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" required disabled={saving} />
          </div>
          <div><label className="text-xs font-medium text-slate-500 mb-1 block">Valor (R$)</label><input type="number" step="0.01" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" required disabled={saving} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-500 mb-1 block">Data</label><input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" disabled={saving} /></div>
            <div><label className="text-xs font-medium text-slate-500 mb-1 block">Hora</label><input type="time" value={form.hora} onChange={(e) => setForm(f => ({ ...f, hora: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" disabled={saving} /></div>
          </div>
          <div><label className="text-xs font-medium text-slate-500 mb-1 block">Categoria</label><select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white" disabled={saving}>{categoriaOptions.map(c => <option key={c.id} value={c.nome}>{c.emoji} {c.nome}</option>)}</select></div>
          {contas.length > 0 && (
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Conta bancária</label>
              <select value={form.conta_id ?? ''} onChange={(e) => setForm(f => ({ ...f, conta_id: Number(e.target.value) }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white" disabled={saving}>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          )}
          <div><label className="text-xs font-medium text-slate-500 mb-1 block">Forma de pagamento</label><div className="grid grid-cols-2 gap-2">{PAYMENTS.map(p => { const Icon = p.icon; return (<button key={p.id} type="button" onClick={() => setForm(f => ({ ...f, payment: p.id as any }))} disabled={saving} className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.payment === p.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}><Icon size={15} /> {p.label}</button>); })}</div></div>
          <div className="flex gap-2">
            {editingEntry && onRequestDelete && (
              <button type="button" onClick={() => onRequestDelete(editingEntry.id)} className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors">
                <Trash2 size={16} />
              </button>
            )}
            <button type="submit" disabled={saving} className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-400 text-slate-900 font-semibold py-2.5 rounded-lg text-sm transition-colors">{saving ? 'Salvando...' : editingEntry ? 'Salvar alterações' : 'Salvar lançamento'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
