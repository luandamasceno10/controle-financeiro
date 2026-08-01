'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Categoria } from '@/lib/supabase';
import { ICONS, ICON_NAMES, COLOR_SWATCHES, sortCategoriasNatural } from '@/lib/categorias';
import { useToast, ToastContainer } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';
import { Plus, X, Pencil, Trash2, Tag, CornerDownRight } from 'lucide-react';

export default function CategoriaEditor({ userId }: { userId: string }) {
  const { toasts, addToast, removeToast } = useToast();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'saida' | 'entrada'>('saida');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Categoria | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ nome: '', tipo: 'saida' as 'entrada' | 'saida', cor: COLOR_SWATCHES[0], icone: ICON_NAMES[0], parent_id: null as number | null });

  const [deleteConfirm, setDeleteConfirm] = useState<Categoria | null>(null);

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data } = await supabase.from('categorias').select('*').eq('user_id', userId).order('ordem');
      if (data) setCategorias(data);
    } catch (err: any) {
      addToast('Erro ao carregar categorias: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const ativasDoTab = useMemo(() => categorias.filter(c => c.tipo === tab && c.ativa), [categorias, tab]);
  const topLevel = useMemo(() => sortCategoriasNatural(ativasDoTab.filter(c => !c.parent_id)), [ativasDoTab]);
  const childrenOf = (parentId: number) => sortCategoriasNatural(ativasDoTab.filter(c => c.parent_id === parentId));
  const parentOptions = useMemo(
    () => sortCategoriasNatural(categorias.filter(c => c.tipo === form.tipo && c.ativa && !c.parent_id && c.id !== editing?.id)),
    [categorias, form.tipo, editing]
  );

  const openNew = (parentId: number | null = null) => {
    setEditing(null);
    setForm({ nome: '', tipo: tab, cor: COLOR_SWATCHES[0], icone: ICON_NAMES[0], parent_id: parentId });
    setShowForm(true);
  };

  const openEdit = (cat: Categoria) => {
    setEditing(cat);
    setForm({ nome: cat.nome, tipo: cat.tipo, cor: cat.cor, icone: cat.icone, parent_id: cat.parent_id });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome) return;

    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from('categorias').update({
          nome: form.nome, tipo: form.tipo, cor: form.cor, icone: form.icone, parent_id: form.parent_id,
        }).eq('id', editing.id);
        if (error) throw error;
        addToast('Categoria atualizada!', 'success');
      } else {
        const maxOrdem = Math.max(0, ...categorias.filter(c => c.tipo === form.tipo).map(c => c.ordem));
        const { error } = await supabase.from('categorias').insert([{
          user_id: userId, nome: form.nome, tipo: form.tipo, cor: form.cor,
          icone: form.icone, parent_id: form.parent_id, ordem: maxOrdem + 1,
        }]);
        if (error) throw error;
        addToast('Categoria criada!', 'success');
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
      // Soft delete: lançamentos antigos continuam resolvendo a categoria (nome/cor/ícone)
      await supabase.from('categorias').update({ ativa: false }).eq('id', deleteConfirm.id);
      // Subcategorias órfãs sobem para o nível principal em vez de ficarem escondidas
      await supabase.from('categorias').update({ parent_id: null }).eq('parent_id', deleteConfirm.id);
      await loadData();
      addToast('Categoria removida', 'success');
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
          <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
            <Tag size={16} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Categorias</h1>
            <p className="text-xs text-slate-400">Gerencie as categorias de entrada e saída</p>
          </div>
        </div>
        <button
          onClick={() => openNew()}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus size={16} strokeWidth={2.5} /> Nova categoria
        </button>
      </div>

      <div className="flex bg-slate-100 rounded-lg p-1 w-fit">
        <button onClick={() => setTab('saida')} className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${tab === 'saida' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Saída</button>
        <button onClick={() => setTab('entrada')} className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${tab === 'entrada' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Entrada</button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Carregando...</div>
        ) : topLevel.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Nenhuma categoria de {tab === 'saida' ? 'saída' : 'entrada'} ainda.</div>
        ) : (
          topLevel.map((cat) => {
            const Icon = ICONS[cat.icone] || Tag;
            const subs = childrenOf(cat.id);
            return (
              <div key={cat.id}>
                <div className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: cat.cor + '20', color: cat.cor }}>
                      <Icon size={15} />
                    </div>
                    <span className="text-sm text-slate-700">{cat.nome}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openNew(cat.id)} title="Nova subcategoria" className="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"><Plus size={15} /></button>
                    <button onClick={() => openEdit(cat)} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><Pencil size={15} /></button>
                    <button onClick={() => setDeleteConfirm(cat)} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 size={15} /></button>
                  </div>
                </div>
                {subs.map((sub) => {
                  const SubIcon = ICONS[sub.icone] || Tag;
                  return (
                    <div key={sub.id} className="flex items-center justify-between pl-10 pr-4 py-2.5 hover:bg-slate-50 transition-colors border-t border-slate-50">
                      <div className="flex items-center gap-2.5">
                        <CornerDownRight size={13} className="text-slate-300 shrink-0" />
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: sub.cor + '20', color: sub.cor }}>
                          <SubIcon size={13} />
                        </div>
                        <span className="text-sm text-slate-600">{sub.nome}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(sub)} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><Pencil size={14} /></button>
                        <button onClick={() => setDeleteConfirm(sub)} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-slate-800">{editing ? 'Editar categoria' : form.parent_id ? 'Nova subcategoria' : 'Nova categoria'}</h3>
              <button onClick={() => setShowForm(false)} disabled={saving}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setForm(f => ({ ...f, tipo: 'saida', parent_id: null }))} className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.tipo === 'saida' ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-slate-600 border-slate-200'}`}>Saída</button>
                <button type="button" onClick={() => setForm(f => ({ ...f, tipo: 'entrada', parent_id: null }))} className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.tipo === 'entrada' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-600 border-slate-200'}`}>Entrada</button>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Nome</label>
                <input type="text" value={form.nome} onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" required disabled={saving} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Categoria pai (opcional)</label>
                <select value={form.parent_id ?? ''} onChange={(e) => setForm(f => ({ ...f, parent_id: e.target.value ? Number(e.target.value) : null }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white" disabled={saving}>
                  <option value="">Nenhuma — categoria principal</option>
                  {parentOptions.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                <p className="text-xs text-slate-400 mt-1">Escolha para criar como subcategoria de outra já existente.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Cor</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_SWATCHES.map((c) => (
                    <button key={c} type="button" onClick={() => setForm(f => ({ ...f, cor: c }))} className={`w-8 h-8 rounded-full transition-transform ${form.cor === c ? 'ring-2 ring-offset-2 ring-slate-800 scale-105' : ''}`} style={{ backgroundColor: c }} disabled={saving} />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Ícone</label>
                <div className="grid grid-cols-8 gap-2">
                  {ICON_NAMES.map((name) => {
                    const Icon = ICONS[name];
                    return (
                      <button key={name} type="button" onClick={() => setForm(f => ({ ...f, icone: name }))} className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-colors ${form.icone === name ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`} disabled={saving}>
                        <Icon size={15} />
                      </button>
                    );
                  })}
                </div>
              </div>
              <button type="submit" disabled={saving} className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-400 text-slate-900 font-semibold py-2.5 rounded-lg text-sm transition-colors">
                {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar categoria'}
              </button>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Remover categoria"
        message={`Tem certeza que deseja remover "${deleteConfirm?.nome}"? Lançamentos antigos continuam mostrando essa categoria normalmente.`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
        confirmText="Remover"
        danger
      />
    </main>
  );
}
