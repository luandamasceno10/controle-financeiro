'use client';

import { useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { CartaoCredito, Fatura, Lancamento, Categoria } from '@/lib/supabase';
import { parseFaturaPdf } from '@/lib/fatura-pdf';
import { shiftCompetencia, ensureFatura } from '@/lib/faturas';
import type { StatementLine } from '@/lib/statement';
import { X, Upload, CheckCircle2, PlusCircle, FileUp, Copy, Check, Pencil, Receipt, CalendarClock } from 'lucide-react';

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
  categoria: string;
  categoria_id: number | null;
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
  const [linesAtual, setLinesAtual] = useState<MatchedLine[] | null>(null);
  const [linesFutura, setLinesFutura] = useState<MatchedLine[] | null>(null);
  const [faturaFutura, setFaturaFutura] = useState<Fatura | null>(null);
  const [encargos, setEncargos] = useState(0);
  const [encargoCriando, setEncargoCriando] = useState(false);
  const [encargoCriado, setEncargoCriado] = useState(false);
  const [encargoCategoria, setEncargoCategoria] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [errorDetails, setErrorDetails] = useState('');
  const [copied, setCopied] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [bulkCreating, setBulkCreating] = useState(false);
  const [editingIdx, setEditingIdx] = useState<{ destino: 'atual' | 'futura'; idx: number } | null>(null);
  const [editValue, setEditValue] = useState('');

  const categoriasSaida = useMemo(() => categorias.filter((c) => !c.parent_id), [categorias]);
  const categoriaPadrao = () => categoriasSaida[0]?.nome || 'Diversos';
  const categoriaIdPorNome = (nome: string) => categorias.find((c) => c.nome === nome)?.id ?? null;

  const faturaEntries = useMemo(() => entries.filter((e) => e.fatura_id === fatura.id), [entries, fatura.id]);

  const matchLine = (line: StatementLine, contraEntries: Lancamento[]): boolean => {
    return contraEntries.some((e) => {
      const mesmoValor = Math.abs(Number(e.valor) - line.valor) < 0.01;
      if (!mesmoValor) return false;
      const dias = Math.abs((new Date(e.data + 'T00:00:00').getTime() - new Date(line.data + 'T00:00:00').getTime()) / 86400000);
      return dias <= 5;
    });
  };

  const encargoJaLancado = useMemo(
    () => faturaEntries.some((e) => /encargo/i.test(e.descricao) && Math.abs(Number(e.valor) - encargos) < 0.02),
    [faturaEntries, encargos]
  );

  // Categoriza pela memória: se essa mesma descrição (ignorando maiúsculas/
  // espaços) já apareceu antes num lançamento de saída, usa a categoria de
  // da última vez — mesma lógica de "última categoria usada" do formulário
  // manual, só que aplicada de uma vez pra todas as linhas reconhecidas.
  const buscarMemoriaCategoria = async (): Promise<Map<string, string>> => {
    const mapa = new Map<string, string>();
    const { data } = await supabase
      .from('lancamentos')
      .select('descricao, categoria, data')
      .eq('user_id', userId)
      .eq('tipo', 'saida')
      .order('data', { ascending: false })
      .limit(1000);
    for (const row of data || []) {
      const chave = row.descricao.trim().toLowerCase();
      if (!mapa.has(chave)) mapa.set(chave, row.categoria);
    }
    return mapa;
  };

  const handleFile = async (file: File) => {
    setError('');
    setErrorDetails('');
    setFileName(file.name);
    setParsing(true);
    setLinesAtual(null);
    setLinesFutura(null);
    setFaturaFutura(null);
    setEncargos(0);
    setEncargoCriado(false);
    try {
      const parsed = await parseFaturaPdf(file, fatura.competencia);
      if (parsed.atual.length === 0 && parsed.proximaFatura.length === 0 && parsed.encargos === 0) {
        setError('Não consegui reconhecer nenhuma compra no PDF. O layout dessa fatura pode ser diferente do que sabemos ler — tente conferir manualmente.');
        return;
      }

      const memoria = await buscarMemoriaCategoria();
      const paraCategoria = (desc: string) => memoria.get(desc.trim().toLowerCase()) || categoriaPadrao();
      const toMatched = (l: StatementLine, contraEntries: Lancamento[]): MatchedLine => {
        const categoriaNome = paraCategoria(l.descricao);
        return { ...l, matched: matchLine(l, contraEntries), creating: false, created: false, categoria: categoriaNome, categoria_id: categoriaIdPorNome(categoriaNome) };
      };

      setLinesAtual(parsed.atual.map((l) => toMatched(l, faturaEntries)));
      setEncargos(parsed.encargos);
      setEncargoCategoria(categoriaPadrao());

      if (parsed.proximaFatura.length > 0) {
        const competenciaFutura = shiftCompetencia(fatura.competencia, 1);
        const futura = await ensureFatura(cartao, competenciaFutura, userId);
        setFaturaFutura(futura);
        const futuraEntriesAgora = entries.filter((e) => e.fatura_id === futura.id);
        setLinesFutura(parsed.proximaFatura.map((l) => toMatched(l, futuraEntriesAgora)));
      } else {
        setLinesFutura([]);
      }
    } catch (err: any) {
      setError('Erro ao ler o PDF: ' + err.message);
      // Detalhe técnico pra diagnosticar erros que só acontecem em aparelhos
      // específicos (o normal "err.message" sozinho não diz em que ponto do
      // código quebrou) — o botão de copiar existe porque digitar/print de
      // pilha de erro no celular é inviável.
      setErrorDetails(
        `Navegador: ${typeof navigator !== 'undefined' ? navigator.userAgent : '?'}\n` +
        `Erro: ${err?.name || '?'}: ${err?.message || '?'}\n` +
        `Pilha:\n${err?.stack || '(sem stack trace)'}`
      );
    } finally {
      setParsing(false);
    }
  };

  const copiarDetalhesErro = async () => {
    try {
      await navigator.clipboard.writeText(errorDetails);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API pode não estar disponível (ex. contexto não seguro) — sem fallback, só não copia.
    }
  };

  const setLinesFor = (destino: 'atual' | 'futura') => (destino === 'atual' ? setLinesAtual : setLinesFutura);

  const criarLancamento = async (destino: 'atual' | 'futura', line: MatchedLine, idx: number): Promise<boolean> => {
    const setLines = setLinesFor(destino);
    const faturaAlvo = destino === 'atual' ? fatura : faturaFutura;
    if (!faturaAlvo) return false;
    setLines((prev) => prev && prev.map((l, i) => (i === idx ? { ...l, creating: true, failed: null } : l)));
    try {
      const { error: insertError } = await supabase.from('lancamentos').insert([{
        user_id: userId,
        cartao_id: cartao.id,
        fatura_id: faturaAlvo.id,
        conta_id: null,
        data: line.data,
        hora: line.hora,
        descricao: line.descricao,
        tipo: 'saida',
        categoria: line.categoria,
        categoria_id: line.categoria_id,
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

  const pendentesAtual = linesAtual?.filter((l) => !l.matched && !l.created) || [];
  const pendentesFutura = linesFutura?.filter((l) => !l.matched && !l.created) || [];
  const totalPendentes = pendentesAtual.length + pendentesFutura.length;

  const criarTodosPendentes = async () => {
    setBulkCreating(true);
    setError('');
    let falhas = 0;
    try {
      if (linesAtual) {
        for (let i = 0; i < linesAtual.length; i++) {
          if (!linesAtual[i].matched && !linesAtual[i].created) {
            const ok = await criarLancamento('atual', linesAtual[i], i);
            if (!ok) falhas++;
          }
        }
      }
      if (linesFutura) {
        for (let i = 0; i < linesFutura.length; i++) {
          if (!linesFutura[i].matched && !linesFutura[i].created) {
            const ok = await criarLancamento('futura', linesFutura[i], i);
            if (!ok) falhas++;
          }
        }
      }
      if (falhas > 0) {
        setError(`${falhas} linha${falhas > 1 ? 's' : ''} não pôde${falhas > 1 ? 'ram' : ''} ser criada${falhas > 1 ? 's' : ''} — veja o motivo ao lado de cada uma abaixo e tente de novo.`);
      }
    } finally {
      setBulkCreating(false);
    }
  };

  const criarEncargo = async () => {
    setEncargoCriando(true);
    try {
      const { error: insertError } = await supabase.from('lancamentos').insert([{
        user_id: userId,
        cartao_id: cartao.id,
        fatura_id: fatura.id,
        conta_id: null,
        data: fatura.data_vencimento,
        hora: null,
        descricao: `Encargos da fatura ${fatura.competencia}`,
        tipo: 'saida',
        categoria: encargoCategoria,
        categoria_id: categoriaIdPorNome(encargoCategoria),
        forma_pagamento: 'cartao',
        valor: encargos,
      }]);
      if (insertError) throw insertError;
      setEncargoCriado(true);
      onImported();
    } catch (err: any) {
      setError('Erro ao lançar encargos: ' + err.message);
    } finally {
      setEncargoCriando(false);
    }
  };

  const startEdit = (destino: 'atual' | 'futura', idx: number, atual: string) => {
    setEditingIdx({ destino, idx });
    setEditValue(atual);
  };

  const saveEdit = () => {
    if (!editingIdx) return;
    const setLines = setLinesFor(editingIdx.destino);
    const idx = editingIdx.idx;
    setLines((prev) => prev && prev.map((l, i) => (i === idx ? { ...l, descricao: editValue.trim() || l.descricao } : l)));
    setEditingIdx(null);
  };

  const renderLinha = (destino: 'atual' | 'futura', line: MatchedLine, idx: number) => {
    const isEditing = editingIdx?.destino === destino && editingIdx.idx === idx;
    return (
      <div key={idx} className="px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingIdx(null); }}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-sm bg-white dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-800"
                />
                <button onClick={saveEdit} className="text-xs font-semibold text-emerald-600 shrink-0">OK</button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{line.descricao}</p>
                {!line.created && (
                  <button onClick={() => startEdit(destino, idx, line.descricao)} className="text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 shrink-0" title="Editar nome">
                    <Pencil size={11} />
                  </button>
                )}
              </div>
            )}
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
            <button onClick={() => criarLancamento(destino, line, idx)} disabled={line.creating} className={`inline-flex items-center gap-1 text-xs font-medium text-white disabled:opacity-50 px-2.5 py-1.5 rounded-md shrink-0 ${line.failed ? 'bg-rose-600 hover:bg-rose-500' : 'bg-slate-800 hover:bg-slate-700'}`}>
              <PlusCircle size={12} /> {line.creating ? '...' : line.failed ? 'Tentar de novo' : 'Criar'}
            </button>
          )}
        </div>
        {!line.matched && !line.created && (
          <select
            value={line.categoria}
            onChange={(e) => {
              const nome = e.target.value;
              const setLines = setLinesFor(destino);
              setLines((prev) => prev && prev.map((l, i) => (i === idx ? { ...l, categoria: nome, categoria_id: categoriaIdPorNome(nome) } : l)));
            }}
            className="mt-1.5 w-full border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-800"
          >
            {categoriasSaida.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
          </select>
        )}
        {line.failed && (
          <p className="text-xs text-rose-600 mt-1">{line.failed}</p>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Importar fatura em PDF — {cartao.nome}</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">Envie o PDF da fatura de {fatura.competencia}. Comparamos com as compras já lançadas e você cria o que faltar em um clique.</p>

        {!linesAtual && !parsing && (
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

        {error && (
          <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 rounded-lg px-3 py-2.5 mb-4">
            <p className="text-sm text-rose-600">{error}</p>
            {errorDetails && (
              <button onClick={copiarDetalhesErro} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:text-rose-800">
                {copied ? <><Check size={12} /> Copiado!</> : <><Copy size={12} /> Copiar detalhes do erro</>}
              </button>
            )}
          </div>
        )}

        {linesAtual && (
          <>
            {encargos > 0 && (
              <div className="mb-4 border border-amber-200 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-4 py-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <Receipt size={14} /> Encargos desta fatura (juros, multa, IOF): {currency(encargos)}
                  </p>
                  {encargoCriado || encargoJaLancado ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-md">
                      <CheckCircle2 size={12} /> Já lançado
                    </span>
                  ) : (
                    <button onClick={criarEncargo} disabled={encargoCriando} className="inline-flex items-center gap-1 text-xs font-medium text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-2.5 py-1.5 rounded-md">
                      <PlusCircle size={12} /> {encargoCriando ? '...' : 'Lançar como um único gasto'}
                    </button>
                  )}
                </div>
                {!encargoCriado && !encargoJaLancado && (
                  <select
                    value={encargoCategoria}
                    onChange={(e) => setEncargoCategoria(e.target.value)}
                    className="mt-2 w-full border border-amber-200 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 focus:outline-none"
                  >
                    {categoriasSaida.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                  </select>
                )}
              </div>
            )}

            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <Upload size={12} className="inline mr-1" />{fileName} · {(linesAtual.length + (linesFutura?.length || 0))} compras reconhecidas · {totalPendentes} pendentes
              </p>
              {totalPendentes > 0 && (
                <button onClick={criarTodosPendentes} disabled={bulkCreating} className="text-xs font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors">
                  {bulkCreating ? 'Criando...' : `Criar todas as ${totalPendentes} pendentes`}
                </button>
              )}
            </div>
            <div className="border border-slate-100 dark:border-slate-800 rounded-lg divide-y divide-slate-50 dark:divide-slate-800 max-h-96 overflow-y-auto">
              {linesAtual.map((line, idx) => renderLinha('atual', line, idx))}
            </div>

            {linesFutura && linesFutura.length > 0 && faturaFutura && (
              <div className="mt-5">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <CalendarClock size={13} /> Compras que só entram na fatura de {faturaFutura.competencia}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">A própria fatura já avisa: essas parcelas só serão cobradas no mês que vem. Lançamos direto na fatura futura pra não esquecer — e pra não duplicar quando você importar o PDF de lá.</p>
                <div className="border border-slate-100 dark:border-slate-800 rounded-lg divide-y divide-slate-50 dark:divide-slate-800 max-h-96 overflow-y-auto">
                  {linesFutura.map((line, idx) => renderLinha('futura', line, idx))}
                </div>
              </div>
            )}

            <button onClick={() => { setLinesAtual(null); setLinesFutura(null); setFileName(''); setError(''); }} className="mt-4 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 self-start">
              Enviar outro arquivo
            </button>
          </>
        )}
      </div>
    </div>
  );
}
