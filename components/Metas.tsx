'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Meta, MetaContribuicao, ContaBancaria } from '@/lib/supabase';
import { computeProgresso } from '@/lib/metas';
import { useToast, ToastContainer } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';
import {
  Plus, X, Pencil, Trash2, Target, TrendingUp, Calendar, CheckCircle2,
  AlertTriangle, PlusCircle, Trophy, Archive, MoreVertical,
} from 'lucide-react';

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

const CORES = ['#059669', '#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#0891B2', '#DC2626', '#64748B'];

export default function Metas({ userId }: { userId: string }) {
  const { toasts, addToast, removeToast } = useToast();

  const [metas, setMetas] = useState<Meta[]>([]);
  const [contribuicoes, setContribuicoes] = useState<MetaContribuicao[]>([]);
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Meta | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ nome: '', valor_alvo: '', data_alvo: '', cor: CORES[0] });
  const [archiveConfirm, setArchiveConfirm] = useState<Meta | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Meta | null>(null);
  const [menuOpenFor, setMenuOpenFor] = useState<number | null>(null);

  const [contributingTo, setContributingTo] = useState<Meta | null>(null);
  const [contribForm, setContribForm] = useState({ valor: '', nota: '', conta_id: null as number | null });
  const [contributing, setContributing] = useState(false);

  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [metasResult, contribResult, contasResult] = await Promise.all([
        supabase.from('metas').select('*').eq('user_id', userId).order('created_at'),
        supabase.from('metas_contribuicoes').select('*').eq('user_id', userId).order('data', { ascending: false }),
        supabase.from('contas_bancarias').select('*').eq('user_id', userId).eq('ativa', true),
      ]);
      if (metasResult.data) setMetas(metasResult.data);
      if (contribResult.data) setContribuicoes(contribResult.data);
      if (contasResult.data) setContas(contasResult.data);
    } catch (err: any) {
      addToast('Erro ao carregar metas: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const metasAtivas = useMemo(() => metas.filter((m) => m.status !== 'arquivada'), [metas]);
  const contribuicoesDaMeta = (metaId: number) => contribuicoes.filter((c) => c.meta_id === metaId);

  const openNew = () => {
    setEditing(null);
    setForm({ nome: '', valor_alvo: '', data_alvo: '', cor: CORES[Math.floor(Math.random() * CORES.length)] });
    setShowForm(true);
  };

  const openEdit = (meta: Meta) => {
    setEditing(meta);
    setForm({ nome: meta.nome, valor_alvo: String(meta.valor_alvo), data_alvo: meta.data_alvo || '', cor: meta.cor });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome || !form.valor_alvo || parseFloat(form.valor_alvo) <= 0) return;

    setSaving(true);
    try {
      const payload = {
        nome: form.nome,
        valor_alvo: parseFloat(form.valor_alvo),
        data_alvo: form.data_alvo || null,
        cor: form.cor,
      };
      if (editing) {
        const { error } = await supabase.from('metas').update(payload).eq('id', editing.id);
        if (error) throw error;
        addToast('Meta atualizada!', 'success');
      } else {
        const { error } = await supabase.from('metas').insert([{ ...payload, user_id: userId }]);
        if (error) throw error;
        addToast('Meta criada! Vamos alcançá-la 🎯', 'success');
      }
      await loadData();
      setShowForm(false);
    } catch (err: any) {
      addToast('Erro ao salvar: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmArchive = async () => {
    if (!archiveConfirm) return;
    try {
      await supabase.from('metas').update({ status: 'arquivada' }).eq('id', archiveConfirm.id);
      await loadData();
      addToast('Meta arquivada', 'success');
    } catch (err: any) {
      addToast('Erro ao arquivar: ' + err.message, 'error');
    } finally {
      setArchiveConfirm(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await supabase.from('metas').delete().eq('id', deleteConfirm.id);
      await loadData();
      addToast('Meta apagada', 'success');
    } catch (err: any) {
      addToast('Erro ao apagar: ' + err.message, 'error');
    } finally {
      setDeleteConfirm(null);
    }
  };

  const openContribute = (meta: Meta) => {
    setContributingTo(meta);
    setContribForm({ valor: '', nota: '', conta_id: contas[0]?.id ?? null });
  };

  const handleContribute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contributingTo || !contribForm.valor || !contribForm.conta_id || parseFloat(contribForm.valor) <= 0) return;

    setContributing(true);
    try {
      const { data: lanc, error: lancError } = await supabase.from('lancamentos').insert([{
        user_id: userId,
        conta_id: contribForm.conta_id,
        data: todayISO(),
        hora: nowTime(),
        descricao: `Meta: ${contributingTo.nome}`,
        tipo: 'saida',
        categoria: 'Investimentos & Futuro',
        forma_pagamento: 'pix',
        valor: parseFloat(contribForm.valor),
      }]).select().single();
      if (lancError) throw lancError;
      const lancamentoId = lanc.id;

      const { error } = await supabase.from('metas_contribuicoes').insert([{
        meta_id: contributingTo.id,
        user_id: userId,
        valor: parseFloat(contribForm.valor),
        nota: contribForm.nota || null,
        lancamento_id: lancamentoId,
      }]);
      if (error) throw error;

      const novasContribs = [...contribuicoesDaMeta(contributingTo.id), { valor: parseFloat(contribForm.valor) } as MetaContribuicao];
      const novoTotal = novasContribs.reduce((s, c) => s + Number(c.valor), 0);
      if (novoTotal >= contributingTo.valor_alvo) {
        await supabase.from('metas').update({ status: 'concluida' }).eq('id', contributingTo.id);
        addToast(`Meta "${contributingTo.nome}" concluída! 🎉`, 'success');
      } else {
        addToast('Contribuição registrada!', 'success');
      }

      await loadData();
      setContributingTo(null);
    } catch (err: any) {
      addToast('Erro ao contribuir: ' + err.message, 'error');
    } finally {
      setContributing(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-5 py-8 space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <Target size={16} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Metas e Objetivos</h1>
            <p className="text-xs text-slate-400 dark:text-slate-500">Defina um alvo e acompanhe seu ritmo até chegar lá</p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus size={16} strokeWidth={2.5} /> Nova meta
        </button>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-center text-sm text-slate-400 dark:text-slate-500">Carregando...</div>
      ) : metasAtivas.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-10 text-center">
          <div className="w-12 h-12 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto mb-4">
            <Target size={22} />
          </div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Nenhuma meta ainda</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">Crie sua primeira meta para começar a acompanhar seu progresso.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {metasAtivas.map((meta) => {
            const contribs = contribuicoesDaMeta(meta.id);
            const p = computeProgresso(Number(meta.valor_alvo), meta.data_alvo, meta.created_at, contribs);
            const concluida = meta.status === 'concluida';
            const isExpanded = expanded === meta.id;

            return (
              <div key={meta.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : meta.id)}>
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: meta.cor + '20', color: meta.cor }}>
                        {concluida ? <Trophy size={16} /> : <Target size={16} />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{meta.nome}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {currency(p.valorAtual)} de {currency(Number(meta.valor_alvo))}
                          {meta.data_alvo && ` · até ${fmtDate(meta.data_alvo)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 relative">
                      <button onClick={() => openEdit(meta)} className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"><Pencil size={15} /></button>
                      <button onClick={() => setMenuOpenFor(menuOpenFor === meta.id ? null : meta.id)} className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"><MoreVertical size={15} /></button>
                      {menuOpenFor === meta.id && (
                        <div className="absolute right-0 top-10 z-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 w-40">
                          <button onClick={() => { setArchiveConfirm(meta); setMenuOpenFor(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"><Archive size={13} /> Arquivar</button>
                          <button onClick={() => { setDeleteConfirm(meta); setMenuOpenFor(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50"><Trash2 size={13} /> Apagar</button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${p.pct}%`, backgroundColor: concluida ? '#059669' : meta.cor }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold" style={{ color: meta.cor }}>{p.pct}%</span>
                    {concluida ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-medium"><CheckCircle2 size={12} /> Concluída</span>
                    ) : p.noPrazo === false ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 font-medium"><AlertTriangle size={12} /> Abaixo do ritmo</span>
                    ) : p.noPrazo === true ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-medium"><TrendingUp size={12} /> No ritmo certo</span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">Sem prazo definido</span>
                    )}
                  </div>

                  {!concluida && (p.ritmoNecessarioMensal !== null || p.diasRestantes !== null) && (
                    <div className="mt-3 bg-slate-50 dark:bg-slate-900 rounded-lg px-3 py-2.5 flex items-center gap-2">
                      <Calendar size={14} className="text-slate-400 dark:text-slate-500 shrink-0" />
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {p.diasRestantes !== null && p.diasRestantes > 0 ? (
                          <>Faltam <strong>{currency(p.restante)}</strong> em <strong>{p.diasRestantes}</strong> dias — reserve cerca de <strong>{currency(p.ritmoNecessarioMensal || 0)}</strong>/mês para chegar lá.</>
                        ) : p.diasRestantes === 0 ? (
                          <>O prazo é hoje — faltam <strong>{currency(p.restante)}</strong>.</>
                        ) : (
                          <>Você está contribuindo cerca de <strong>{currency(p.ritmoAtualMensal)}</strong>/mês em média.</>
                        )}
                      </p>
                    </div>
                  )}

                  {!concluida && (
                    <button
                      onClick={() => openContribute(meta)}
                      className="w-full mt-3 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs px-3 py-2.5 rounded-lg transition-colors"
                    >
                      <PlusCircle size={14} /> Contribuir
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                    {contribs.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400 dark:text-slate-500">Nenhuma contribuição ainda.</div>
                    ) : (
                      contribs.map((c) => (
                        <div key={c.id} className="flex items-center justify-between px-4 py-2.5">
                          <div className="min-w-0">
                            <p className="text-sm text-slate-700 dark:text-slate-200">{fmtDate(c.data)}</p>
                            {c.nota && <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{c.nota}</p>}
                          </div>
                          <span className="text-sm font-semibold text-emerald-600 shrink-0">+{currency(Number(c.valor))}</span>
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
          <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">{editing ? 'Editar meta' : 'Nova meta'}</h3>
              <button onClick={() => setShowForm(false)} disabled={saving}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Nome da meta</label>
                <input type="text" value={form.nome} onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Reserva de emergência, Viagem" className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100" required disabled={saving} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Valor alvo (R$)</label>
                <input type="number" step="0.01" min="0.01" value={form.valor_alvo} onChange={(e) => setForm(f => ({ ...f, valor_alvo: e.target.value }))} placeholder="0,00" className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100" required disabled={saving} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Prazo (opcional)</label>
                <input type="date" value={form.data_alvo} onChange={(e) => setForm(f => ({ ...f, data_alvo: e.target.value }))} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100" disabled={saving} />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Com um prazo, calculamos quanto reservar por mês para chegar lá.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Cor</label>
                <div className="flex gap-2">
                  {CORES.map((c) => (
                    <button key={c} type="button" onClick={() => setForm(f => ({ ...f, cor: c }))} className={`w-8 h-8 rounded-full border-2 transition-transform ${form.cor === c ? 'border-slate-800 scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} disabled={saving} />
                  ))}
                </div>
              </div>
              <button type="submit" disabled={saving} className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-400 text-slate-900 font-semibold py-2.5 rounded-lg text-sm transition-colors">
                {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar meta'}
              </button>
            </form>
          </div>
        </div>
      )}

      {contributingTo && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">Contribuir com "{contributingTo.nome}"</h3>
              <button onClick={() => setContributingTo(null)} disabled={contributing}><X size={18} /></button>
            </div>
            <form onSubmit={handleContribute} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Valor (R$)</label>
                <input type="number" step="0.01" min="0.01" autoFocus value={contribForm.valor} onChange={(e) => setContribForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100" required disabled={contributing} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Nota (opcional)</label>
                <input type="text" value={contribForm.nota} onChange={(e) => setContribForm(f => ({ ...f, nota: e.target.value }))} placeholder="Ex: 13º salário" className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100" disabled={contributing} />
              </div>
              {contas.length > 0 ? (
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Debitar da conta</label>
                  <select value={contribForm.conta_id ?? ''} onChange={(e) => setContribForm(f => ({ ...f, conta_id: Number(e.target.value) }))} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-800" disabled={contributing} required>
                    {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">O valor sai da conta agora e soma no progresso da meta.</p>
                </div>
              ) : (
                <p className="text-xs text-rose-500">Cadastre uma conta bancária antes de contribuir.</p>
              )}
              <button type="submit" disabled={contributing || !contribForm.conta_id} className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-400 text-slate-900 font-semibold py-2.5 rounded-lg text-sm transition-colors">
                {contributing ? 'Salvando...' : 'Confirmar contribuição'}
              </button>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!archiveConfirm}
        title="Arquivar meta"
        message={`Tem certeza que deseja arquivar "${archiveConfirm?.nome}"? O histórico de contribuições é mantido, mas ela sai da lista principal.`}
        onConfirm={confirmArchive}
        onCancel={() => setArchiveConfirm(null)}
        confirmText="Arquivar"
        danger
      />

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Apagar meta"
        message={`Tem certeza que deseja apagar "${deleteConfirm?.nome}" definitivamente? As contribuições registradas serão removidas (os lançamentos já feitos nas contas continuam no histórico).`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
        confirmText="Apagar"
        danger
      />
    </main>
  );
}
