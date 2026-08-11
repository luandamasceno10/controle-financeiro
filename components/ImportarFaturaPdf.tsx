'use client';

import { useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { CartaoCredito, Fatura, Lancamento, Categoria } from '@/lib/supabase';
import { parseFaturaPdf } from '@/lib/fatura-pdf';
import type { StatementLine } from '@/lib/statement';
import { X, Upload, CheckCircle2, PlusCircle, FileUp } from 'lucide-react';

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface MatchedLine extends StatementLine {
  matched: boolean;
  creating: boolean;
  created: boolean;
  failed?: string | null;
}

export default function ImportarFaturaPdf({
  userId, cartao, fatura, entries, categorias, onClose, onImported,
}: {
  userId: string;
  cartao: CartaoCredito;
  fatura: Fatura;
  entries: Lancamento[];
  categorias: Categoria[];
  onClose: () => void;
  onImported: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lines, setLines] = useState<MatchedLine[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [bulkCreating, setBulkCreating] = useState(false);

  const faturaEntries = useMemo(() => entries.filter((e) => e.fatura_id === fatura.id), [entries, fatura.id]);

  const matchLine = (line: StatementLine): boolean => {
    return faturaEntries.some((e) => {
      const mesmoValor = Math.abs(Number(e.valor) - line.valor) < 0.01;
      if (!mesmoValor) return false;
      const dias = Math.abs((new Date(e.data + 'T00:00:00').getTime() - new Date(line.data + 'T00:00:00').getTime()) / 86400000);
      return dias <= 5;
    });
  };

  const handleFile = async (file: File) => {
    setError('');
    setFileName(file.name);
    setParsing(true);
    setLines(null);
    try {
      const parsed = await parseFaturaPdf(file, fatura.competencia);
      if (parsed.length === 0) {
        setError('Não consegui reconhecer nenhuma compra no PDF. O layout dessa fatura pode ser diferente do que sabemos ler — tente conferir manualmente.');
        return;
      }
      setLines(parsed.map((l) => ({ ...l, matched: matchLine(l), creating: false, created: false })));
    } catch (err: any) {
      setError('Erro ao ler o PDF: ' + err.message);
    } finally {
      setParsing(false);
    }
  };

  const categoriaPadrao = () => categorias.find((c) => !c.parent_id)?.nome || 'Diversos';
  const categoriaIdPadrao = () => categorias.find((c) => !c.parent_id)?.id ?? null;

  const criarLancamento = async (line: MatchedLine, idx: number): Promise<boolean> => {
    setLines((prev) => prev && prev.map((l, i) => (i === idx ? { ...l, creating: true, failed: null } : l)));
    try {
      const { error: insertError } = await supabase.from('lancamentos').insert([{
        user_id: userId,
        cartao_id: cartao.id,
        fatura_id: fatura.id,
        conta_id: null,
        data: line.data,
        hora: line.hora,
        descricao: line.descricao,
        tipo: 'saida',
        categoria: categoriaPadrao(),
        categoria_id: categoriaIdPadrao(),
        forma_pagamento: 'cartao',
        valor: line.valor,
      }]);
      if (insertError) throw insertError;
      setLines((prev) => prev && prev.map((l, i) => (i === idx ? { ...l, creating: false, created: true, matched: true, failed: null } : l)));
      onImported();
      return true;
    } catch (err: any) {
      setLines((prev) => prev && prev.map((l, i) => (i === idx ? { ...l, creating: false, failed: err.message } : l)));
      return false;
    }
  };

  const pendentes = lines?.filter((l) => !l.matched && !l.created) || [];

  const criarTodosPendentes = async () => {
    if (!lines) return;
    setBulkCreating(true);
    setError('');
    let falhas = 0;
    try {
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].matched && !lines[i].created) {
          const ok = await criarLancamento(lines[i], i);
          if (!ok) falhas++;
        }
      }
      if (falhas > 0) {
        setError(`${falhas} linha${falhas > 1 ? 's' : ''} não pôde${falhas > 1 ? 'ram' : ''} ser criada${falhas > 1 ? 's' : ''} — veja o motivo ao lado de cada uma abaixo e tente de novo.`);
      }
    } finally {
      setBulkCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Importar fatura em PDF — {cartao.nome}</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">Envie o PDF da fatura de {fatura.competencia}. Comparamos com as compras já lançadas e você cria o que faltar em um clique.</p>

        {!lines && !parsing && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-10 text-center cursor-pointer hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <FileUp size={28} className="mx-auto text-slate-400 dark:text-slate-500 mb-3" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Clique para escolher o PDF da fatura</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Funciona melhor com o PDF baixado direto do app/site do banco (não uma foto ou print).</p>
            <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
        )}

        {parsing && (
          <div className="p-10 text-center text-sm text-slate-400 dark:text-slate-500">Lendo o PDF...</div>
        )}

        {error && <p className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 rounded-lg px-3 py-2.5 mb-4">{error}</p>}

        {lines && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <Upload size={12} className="inline mr-1" />{fileName} · {lines.length} compras reconhecidas · {pendentes.length} pendentes
              </p>
              {pendentes.length > 0 && (
                <button onClick={criarTodosPendentes} disabled={bulkCreating} className="text-xs font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors">
                  {bulkCreating ? 'Criando...' : `Criar todas as ${pendentes.length} pendentes`}
                </button>
              )}
            </div>
            <div className="border border-slate-100 dark:border-slate-800 rounded-lg divide-y divide-slate-50 dark:divide-slate-800 max-h-96 overflow-y-auto">
              {lines.map((line, idx) => (
                <div key={idx} className="px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{line.descricao}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{fmtDate(line.data)}</p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums shrink-0 text-slate-700 dark:text-slate-200">
                      -{currency(line.valor)}
                    </span>
                    {line.matched || line.created ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-md shrink-0">
                        <CheckCircle2 size={12} /> {line.created ? 'Criado' : 'Já lançado'}
                      </span>
                    ) : (
                      <button onClick={() => criarLancamento(line, idx)} disabled={line.creating} className={`inline-flex items-center gap-1 text-xs font-medium text-white disabled:opacity-50 px-2.5 py-1.5 rounded-md shrink-0 ${line.failed ? 'bg-rose-600 hover:bg-rose-500' : 'bg-slate-800 hover:bg-slate-700'}`}>
                        <PlusCircle size={12} /> {line.creating ? '...' : line.failed ? 'Tentar de novo' : 'Criar'}
                      </button>
                    )}
                  </div>
                  {line.failed && (
                    <p className="text-xs text-rose-600 mt-1">{line.failed}</p>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => { setLines(null); setFileName(''); setError(''); }} className="mt-4 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 self-start">
              Enviar outro arquivo
            </button>
          </>
        )}
      </div>
    </div>
  );
}
