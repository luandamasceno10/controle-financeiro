'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Lancamento, Categoria, ContaBancaria, CartaoCredito, Meta } from '@/lib/supabase';
import { PAYMENTS } from '@/lib/payments';
import { competenciaForPurchase, ensureFatura, shiftPurchaseDate } from '@/lib/faturas';
import { suggestCategoria } from '@/lib/categorize';
import { sortCategoriasNatural } from '@/lib/categorias';
import { uploadAnexo, removeAnexo, getAnexoUrl } from '@/lib/anexos';
import MoneyInput from './MoneyInput';
import { X, Trash2, Sparkles, Plus, SplitSquareHorizontal, Paperclip, Target } from 'lucide-react';

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
  cartoes,
  metas = [],
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
  cartoes: CartaoCredito[];
  metas?: Meta[];
  editingEntry: Lancamento | null;
  onClose: () => void;
  onSaved: () => void;
  onRequestDelete?: (id: number) => void;
  onError?: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [anexoFile, setAnexoFile] = useState<File | null>(null);
  const [anexoRemover, setAnexoRemover] = useState(false);
  const [anexoUrl, setAnexoUrl] = useState<string | null>(null);
  const [anexoLoading, setAnexoLoading] = useState(false);
  const [categoriaSugerida, setCategoriaSugerida] = useState<string | null>(null);
  const [sugerindo, setSugerindo] = useState(false);
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
        cartao_id: editingEntry.cartao_id ?? cartoes[0]?.id ?? null,
        parcelado: false,
        parcelas: '2',
        recorrente: false,
        splitEnabled: false,
        splits: [{ category: '', amount: '' }, { category: '', amount: '' }] as { category: string; amount: string }[],
        meta_id: null as number | null,
      };
    }
    return {
      desc: '', type: 'saida' as 'entrada' | 'saida', category: categoriasSaida.find(c => !c.parent_id)?.nome || '',
      payment: 'pix' as 'pix' | 'cartao', amount: '', date: todayISO(), hora: nowTime(),
      conta_id: contas[0]?.id ?? null,
      cartao_id: cartoes[0]?.id ?? null,
      parcelado: false,
      parcelas: '2',
      splitEnabled: false,
      splits: [{ category: '', amount: '' }, { category: '', amount: '' }] as { category: string; amount: string }[],
      meta_id: null as number | null,
    };
  });

  const categoriaByName = useMemo(() => {
    const map: Record<string, Categoria> = {};
    [...categoriasEntrada, ...categoriasSaida].forEach((c) => { map[`${c.tipo}|${c.nome}`] = c; });
    return map;
  }, [categoriasEntrada, categoriasSaida]);

  const categoriaById = useMemo(() => {
    const map: Record<number, Categoria> = {};
    [...categoriasEntrada, ...categoriasSaida].forEach((c) => { map[c.id] = c; });
    return map;
  }, [categoriasEntrada, categoriasSaida]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.desc || !form.amount) return;

    setSaving(true);
    try {
      const categoriaId = categoriaByName[`${form.type}|${form.category}`]?.id ?? null;
      const isCartao = form.payment === 'cartao' && form.type === 'saida';
      const isParcelado = isCartao && !editingEntry && form.parcelado;
      const totalParcelas = isParcelado ? Math.max(2, parseInt(form.parcelas, 10) || 2) : 1;
      const isSplit = !editingEntry && form.type === 'saida' && !form.parcelado && form.splitEnabled;

      if (isSplit) {
        const validSplits = form.splits.filter(s => s.category && parseFloat(s.amount) > 0);
        if (validSplits.length < 2) throw new Error('Informe ao menos 2 categorias com valor no split');
        const somaSplits = validSplits.reduce((s, x) => s + parseFloat(x.amount), 0);
        const valorTotal = parseFloat(form.amount);
        if (Math.abs(somaSplits - valorTotal) > 0.01) {
          throw new Error(`A soma das partes (${somaSplits.toFixed(2)}) não bate com o valor total (${valorTotal.toFixed(2)})`);
        }

        let cartaoIdSplit: number | null = null;
        let faturaIdSplit: number | null = null;
        let contaIdSplit: number | null = form.conta_id;
        if (isCartao) {
          const cartao = cartoes.find(c => c.id === form.cartao_id);
          if (!cartao) throw new Error('Selecione um cartão de crédito');
          const competencia = competenciaForPurchase(form.date, cartao.dia_fechamento);
          const fatura = await ensureFatura(cartao, competencia, userId);
          cartaoIdSplit = cartao.id;
          faturaIdSplit = fatura.id;
          contaIdSplit = null;
        }

        const splitId = crypto.randomUUID();
        const rows = validSplits.map(s => ({
          user_id: userId,
          data: form.date,
          hora: form.hora,
          descricao: `${form.desc} (${s.category})`,
          tipo: 'saida',
          categoria: s.category,
          categoria_id: categoriaByName[`saida|${s.category}`]?.id ?? null,
          forma_pagamento: form.payment,
          conta_id: contaIdSplit,
          cartao_id: cartaoIdSplit,
          fatura_id: faturaIdSplit,
          valor: parseFloat(s.amount),
          split_id: splitId,
        }));
        const { error } = await supabase.from('lancamentos').insert(rows);
        if (error) throw error;
        onSaved();
        return;
      }

      if (isParcelado) {
        const cartao = cartoes.find(c => c.id === form.cartao_id);
        if (!cartao) throw new Error('Selecione um cartão de crédito');
        const valorTotal = parseFloat(form.amount);
        const valorParcela = Math.floor((valorTotal / totalParcelas) * 100) / 100;
        const parcelamentoId = crypto.randomUUID();
        const rows = [];
        for (let i = 1; i <= totalParcelas; i++) {
          const dataParcela = shiftPurchaseDate(form.date, i - 1);
          const competencia = competenciaForPurchase(dataParcela, cartao.dia_fechamento);
          const fatura = await ensureFatura(cartao, competencia, userId);
          const valor = i === totalParcelas ? Number((valorTotal - valorParcela * (totalParcelas - 1)).toFixed(2)) : valorParcela;
          rows.push({
            user_id: userId,
            data: dataParcela,
            hora: form.hora,
            descricao: `${form.desc} (${i}/${totalParcelas})`,
            tipo: 'saida',
            categoria: form.category,
            categoria_id: categoriaId,
            forma_pagamento: 'cartao',
            conta_id: null,
            cartao_id: cartao.id,
            fatura_id: fatura.id,
            valor,
            parcela_atual: i,
            parcela_total: totalParcelas,
            parcelamento_id: parcelamentoId,
          });
        }
        const { error } = await supabase.from('lancamentos').insert(rows);
        if (error) throw error;
        onSaved();
        return;
      }

      let cartaoId: number | null = null;
      let faturaId: number | null = null;
      let contaId: number | null = form.conta_id;

      if (isCartao) {
        const cartao = cartoes.find(c => c.id === form.cartao_id);
        if (!cartao) throw new Error('Selecione um cartão de crédito');
        const competencia = competenciaForPurchase(form.date, cartao.dia_fechamento);
        const fatura = await ensureFatura(cartao, competencia, userId);
        cartaoId = cartao.id;
        faturaId = fatura.id;
        contaId = null;
      }

      const payload = {
        data: form.date,
        hora: form.hora,
        descricao: form.desc,
        tipo: form.type,
        categoria: form.category,
        categoria_id: categoriaId,
        forma_pagamento: form.payment,
        conta_id: contaId,
        cartao_id: cartaoId,
        fatura_id: faturaId,
        valor: parseFloat(form.amount),
      };

      let anexoPath = editingEntry?.anexo_path ?? null;
      if (anexoRemover && anexoPath) {
        await removeAnexo(anexoPath);
        anexoPath = null;
      }
      if (anexoFile) {
        if (anexoPath) await removeAnexo(anexoPath);
        anexoPath = await uploadAnexo(userId, anexoFile);
      }

      if (editingEntry) {
        const { error } = await supabase.from('lancamentos').update({ ...payload, anexo_path: anexoPath }).eq('id', editingEntry.id);
        if (error) throw error;
      } else if (isCartao && form.recorrente) {
        const cartao = cartoes.find(c => c.id === form.cartao_id)!;
        const competencia = competenciaForPurchase(form.date, cartao.dia_fechamento);
        const { data: compra, error: compraError } = await supabase.from('compras_recorrentes').insert([{
          user_id: userId, cartao_id: cartao.id, descricao: form.desc, categoria: form.category,
          categoria_id: categoriaId, valor: payload.valor, ultima_competencia: competencia,
        }]).select().single();
        if (compraError) throw compraError;
        const { error } = await supabase.from('lancamentos').insert([{ ...payload, anexo_path: anexoPath, user_id: userId, compra_recorrente_id: compra.id }]);
        if (error) throw error;
      } else if (form.meta_id) {
        const { data: lanc, error } = await supabase.from('lancamentos').insert([{ ...payload, anexo_path: anexoPath, user_id: userId }]).select().single();
        if (error) throw error;
        const { error: contribError } = await supabase.from('metas_contribuicoes').insert([{
          meta_id: form.meta_id, user_id: userId, valor: payload.valor, nota: 'Vinculado ao lançamento', lancamento_id: lanc.id,
        }]);
        if (contribError) throw contribError;
        const { data: contribs } = await supabase.from('metas_contribuicoes').select('valor').eq('meta_id', form.meta_id);
        const meta = metas.find(m => m.id === form.meta_id);
        const total = (contribs || []).reduce((s, c) => s + Number(c.valor), 0);
        if (meta && total >= Number(meta.valor_alvo)) {
          await supabase.from('metas').update({ status: 'concluida' }).eq('id', meta.id);
        }
      } else {
        const { error } = await supabase.from('lancamentos').insert([{ ...payload, anexo_path: anexoPath, user_id: userId }]);
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
  const categoriaPaiOptions = useMemo(() => sortCategoriasNatural(categoriaOptions.filter(c => !c.parent_id)), [categoriaOptions]);
  const flatCategoriaSaidaOptions = useMemo(() => sortCategoriasNatural(categoriasSaida), [categoriasSaida]);

  const updateSplit = (index: number, patch: Partial<{ category: string; amount: string }>) => {
    setForm(f => ({ ...f, splits: f.splits.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
  };
  const addSplitRow = () => setForm(f => ({ ...f, splits: [...f.splits, { category: '', amount: '' }] }));
  const removeSplitRow = (index: number) => setForm(f => ({ ...f, splits: f.splits.filter((_, i) => i !== index) }));
  const splitSoma = useMemo(() => form.splits.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0), [form.splits]);
  const splitRestante = (parseFloat(form.amount) || 0) - splitSoma;

  const categoriaAtual = categoriaByName[`${form.type}|${form.category}`];
  const categoriaPaiAtual = categoriaAtual?.parent_id ? categoriaById[categoriaAtual.parent_id] : categoriaAtual;
  const subcategoriaOptions = useMemo(
    () => sortCategoriasNatural(categoriaOptions.filter(c => c.parent_id === categoriaPaiAtual?.id)),
    [categoriaOptions, categoriaPaiAtual]
  );

  // Quando a categoria-pai tem subcategorias, o preenchimento é obrigatório:
  // se a categoria atual não for uma delas, seleciona a primeira automaticamente
  // em vez de deixar o lançamento salvo só no nível do pai.
  useEffect(() => {
    if (subcategoriaOptions.length > 0 && !categoriaAtual?.parent_id) {
      setForm(f => ({ ...f, category: subcategoriaOptions[0].nome }));
    }
  }, [subcategoriaOptions, categoriaAtual]);

  const handleDescricaoBlur = async () => {
    if (!form.desc || form.desc.trim().length < 3) return;
    setSugerindo(true);
    try {
      const sugestao = await suggestCategoria(form.desc, categoriaOptions.map(c => c.nome));
      if (sugestao && sugestao !== form.category) setCategoriaSugerida(sugestao);
    } finally {
      setSugerindo(false);
    }
  };

  const applySugestao = () => {
    if (!categoriaSugerida) return;
    setForm(f => ({ ...f, category: categoriaSugerida }));
    setCategoriaSugerida(null);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">{editingEntry ? 'Editar lançamento' : 'Novo lançamento'}</h3>
          <button onClick={onClose} disabled={saving}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setForm(f => ({ ...f, type: 'entrada', category: categoriasEntrada.find(c => !c.parent_id)?.nome || '', payment: 'pix' }))} className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.type === 'entrada' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>Entrada</button>
            <button type="button" onClick={() => setForm(f => ({ ...f, type: 'saida', category: categoriasSaida.find(c => !c.parent_id)?.nome || '' }))} className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.type === 'saida' ? 'bg-rose-500 text-white border-rose-500' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>Saída</button>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Descrição {sugerindo && <span className="text-violet-400 font-normal">· sugerindo categoria...</span>}</label>
            <input type="text" value={form.desc} onChange={(e) => setForm(f => ({ ...f, desc: e.target.value }))} onBlur={handleDescricaoBlur} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100" required disabled={saving} />
          </div>
          <div><label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Valor (R$)</label><MoneyInput value={form.amount} onChange={(v) => setForm(f => ({ ...f, amount: v }))} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100" required disabled={saving} /></div>
          {form.type === 'saida' && (
            <div><label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Forma de pagamento</label><div className="grid grid-cols-2 gap-2">{PAYMENTS.map(p => { const Icon = p.icon; const disabledOpt = p.id === 'cartao' && cartoes.length === 0; return (<button key={p.id} type="button" onClick={() => !disabledOpt && setForm(f => ({ ...f, payment: p.id as any }))} disabled={saving || disabledOpt} className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40 ${form.payment === p.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}><Icon size={15} /> {p.label}</button>); })}</div></div>
          )}
          {form.type === 'saida' && form.payment === 'cartao' ? (
            cartoes.length > 0 && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Cartão de crédito</label>
                  <select value={form.cartao_id ?? ''} onChange={(e) => setForm(f => ({ ...f, cartao_id: Number(e.target.value) }))} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-800" disabled={saving}>
                    {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Essa compra entra na fatura do cartão e só afeta o saldo da conta quando a fatura for paga.</p>
                </div>
                {!editingEntry && !form.splitEnabled && !form.recorrente && (
                  <div>
                    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <input type="checkbox" checked={form.parcelado} onChange={(e) => setForm(f => ({ ...f, parcelado: e.target.checked }))} disabled={saving} className="rounded border-slate-300" />
                      Compra parcelada
                    </label>
                    {form.parcelado && (
                      <div className="mt-2">
                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Número de parcelas</label>
                        <input type="number" min={2} max={24} value={form.parcelas} onChange={(e) => setForm(f => ({ ...f, parcelas: e.target.value }))} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100" disabled={saving} />
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">O valor total informado é dividido igualmente entre as parcelas, cada uma lançada na fatura do mês correspondente.</p>
                      </div>
                    )}
                  </div>
                )}
                {!editingEntry && !form.splitEnabled && !form.parcelado && (
                  <div>
                    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <input type="checkbox" checked={form.recorrente} onChange={(e) => setForm(f => ({ ...f, recorrente: e.target.checked }))} disabled={saving} className="rounded border-slate-300" />
                      Compra recorrente (assinatura)
                    </label>
                    {form.recorrente && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Esse mesmo valor será lançado automaticamente todo mês, até você cancelar em Cartões de Crédito.</p>
                    )}
                  </div>
                )}
              </div>
            )
          ) : (
            contas.length > 0 && (
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Conta bancária</label>
                <select value={form.conta_id ?? ''} onChange={(e) => setForm(f => ({ ...f, conta_id: Number(e.target.value) }))} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-800" disabled={saving}>
                  {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            )
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Data</label><input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100" disabled={saving} /></div>
            <div><label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Hora</label><input type="time" value={form.hora} onChange={(e) => setForm(f => ({ ...f, hora: e.target.value }))} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100" disabled={saving} /></div>
          </div>
          {!form.splitEnabled && (
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Categoria</label>
              <select
                value={categoriaPaiAtual?.nome || ''}
                onChange={(e) => { setForm(f => ({ ...f, category: e.target.value })); setCategoriaSugerida(null); }}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-800"
                disabled={saving}
              >
                {categoriaPaiOptions.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
              </select>
              {categoriaSugerida && (
                <button type="button" onClick={applySugestao} className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 bg-violet-50 dark:bg-violet-500/10 hover:bg-violet-100 px-2.5 py-1.5 rounded-lg transition-colors">
                  <Sparkles size={12} /> Sugestão: {categoriaSugerida}
                </button>
              )}
            </div>
          )}
          {!form.splitEnabled && subcategoriaOptions.length > 0 && (
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Subcategoria</label>
              <select
                value={categoriaAtual?.parent_id ? form.category : subcategoriaOptions[0].nome}
                onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-800"
                disabled={saving}
                required
              >
                {subcategoriaOptions.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
              </select>
            </div>
          )}
          {!editingEntry && form.type === 'saida' && !form.parcelado && !form.recorrente && (
            <div>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={form.splitEnabled} onChange={(e) => setForm(f => ({ ...f, splitEnabled: e.target.checked }))} disabled={saving} className="rounded border-slate-300" />
                <SplitSquareHorizontal size={14} /> Dividir entre categorias
              </label>
              {form.splitEnabled && (
                <div className="mt-2 space-y-2">
                  {form.splits.map((s, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <select
                        value={s.category}
                        onChange={(e) => updateSplit(i, { category: e.target.value })}
                        className="flex-1 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-800"
                        disabled={saving}
                      >
                        <option value="">Categoria...</option>
                        {flatCategoriaSaidaOptions.map(c => <option key={c.id} value={c.nome}>{c.parent_id ? `↳ ${c.nome}` : c.nome}</option>)}
                      </select>
                      <MoneyInput
                        placeholder="Valor" value={s.amount}
                        onChange={(v) => updateSplit(i, { amount: v })}
                        className="w-24 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100"
                        disabled={saving}
                      />
                      {form.splits.length > 2 && (
                        <button type="button" onClick={() => removeSplitRow(i)} disabled={saving} className="text-slate-400 hover:text-rose-500">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={addSplitRow} disabled={saving} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700">
                    <Plus size={13} /> Adicionar categoria
                  </button>
                  <p className={`text-xs ${Math.abs(splitRestante) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {Math.abs(splitRestante) < 0.01 ? 'Soma bate com o valor total ✓' : `Restam R$ ${splitRestante.toFixed(2)} para completar o valor total`}
                  </p>
                </div>
              )}
            </div>
          )}
          {!editingEntry && form.type === 'saida' && !form.splitEnabled && !form.parcelado && !form.recorrente && metas.length > 0 && (
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block flex items-center gap-1.5">
                <Target size={13} /> Vincular a uma meta (opcional)
              </label>
              <select
                value={form.meta_id ?? ''}
                onChange={(e) => setForm(f => ({ ...f, meta_id: e.target.value ? Number(e.target.value) : null }))}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-800"
                disabled={saving}
              >
                <option value="">Nenhuma</option>
                {metas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
              {form.meta_id && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">O valor deste lançamento também conta como aporte para a meta.</p>}
            </div>
          )}
          {!form.splitEnabled && !form.parcelado && (
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block flex items-center gap-1.5">
                <Paperclip size={13} /> Comprovante (opcional)
              </label>
              {editingEntry?.anexo_path && !anexoRemover && !anexoFile ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={anexoLoading}
                    onClick={async () => {
                      setAnexoLoading(true);
                      const url = await getAnexoUrl(editingEntry.anexo_path!);
                      setAnexoLoading(false);
                      if (url) window.open(url, '_blank');
                    }}
                    className="flex-1 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    {anexoLoading ? 'Abrindo...' : 'Ver comprovante anexado'}
                  </button>
                  <button type="button" onClick={() => setAnexoRemover(true)} disabled={saving} className="text-slate-400 hover:text-rose-500 p-2">
                    <Trash2 size={15} />
                  </button>
                </div>
              ) : (
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => { setAnexoFile(e.target.files?.[0] ?? null); setAnexoRemover(false); }}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100 file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-slate-100 dark:file:bg-slate-600 file:text-slate-600 dark:file:text-slate-100"
                  disabled={saving}
                />
              )}
            </div>
          )}
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
