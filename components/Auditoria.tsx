'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { LancamentoAuditoria } from '@/lib/supabase';
import { SkeletonList } from './Skeleton';
import { History, Pencil, Trash2, Search, X } from 'lucide-react';

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDateHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Campos que interessam mostrar num diff — o resto (id, user_id, created_at
// etc.) é ruído pra quem só quer saber "o que mudou".
const CAMPOS_RELEVANTES: { chave: string; label: string; formato?: 'moeda' }[] = [
  { chave: 'descricao', label: 'Descrição' },
  { chave: 'valor', label: 'Valor', formato: 'moeda' },
  { chave: 'data', label: 'Data' },
  { chave: 'categoria', label: 'Categoria' },
  { chave: 'forma_pagamento', label: 'Forma de pagamento' },
];

function formatarValor(v: any, formato?: 'moeda'): string {
  if (v === null || v === undefined) return '—';
  if (formato === 'moeda') return currency(Number(v));
  return String(v);
}

export default function Auditoria({ userId }: { userId: string }) {
  const [registros, setRegistros] = useState<LancamentoAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const LIMIT = 50;

  const loadMore = async (newOffset: number = offset) => {
    if (newOffset === 0) setLoading(true);
    else setLoadingMore(true);

    try {
      const { data, error } = await supabase
        .from('lancamentos_auditoria')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(newOffset, newOffset + LIMIT - 1);

      if (error) {
        setErro(error.message);
      } else {
        setRegistros((prev) => newOffset === 0 ? (data || []) : [...prev, ...(data || [])]);
        setHasMore((data?.length ?? 0) === LIMIT);
        setOffset(newOffset + LIMIT);
      }
    } finally {
      if (newOffset === 0) setLoading(false);
      else setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadMore(0);
  }, [userId]);

  const registrosFiltrados = useMemo(() => {
    if (!busca.trim()) return registros;
    const termo = busca.toLowerCase().trim();
    return registros.filter((r) => {
      const descricao = r.antes.descricao?.toLowerCase() || '';
      const categoria = r.antes.categoria?.toLowerCase() || '';
      const valor = String(r.antes.valor || '');
      const data = r.antes.data || '';
      return descricao.includes(termo) || categoria.includes(termo) || valor.includes(termo) || data.includes(termo);
    });
  }, [registros, busca]);

  return (
    <main className="max-w-3xl mx-auto px-5 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center">
          <History size={16} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Histórico de alterações</h1>
          <p className="text-xs text-slate-400 dark:text-slate-500">Toda edição ou exclusão de lançamento fica registrada aqui, sem exceção — inclusive as suas mesmo, pra você conseguir provar o que mudou e quando.</p>
        </div>
      </div>

      {registros.length > 0 && (
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none">
            <Search size={16} />
          </div>
          <input
            type="text"
            placeholder="Buscar por descrição, categoria, valor ou data..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-800 dark:text-slate-100"
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-400 transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"><SkeletonList /></div>
      ) : erro ? (
        <div className="bg-rose-50 dark:bg-rose-500/10 text-rose-600 rounded-xl border border-rose-200 dark:border-rose-500/20 p-4 text-sm">{erro}</div>
      ) : registros.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-10 text-center">
          <div className="w-12 h-12 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto mb-4">
            <History size={22} />
          </div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Nada por aqui ainda</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">Assim que você editar ou excluir um lançamento, o registro aparece nesta lista.</p>
        </div>
      ) : registrosFiltrados.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-10 text-center">
          <div className="w-12 h-12 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto mb-4">
            <Search size={22} />
          </div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Nenhum resultado encontrado</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">Tente ajustar os termos de busca.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {registrosFiltrados.length > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400 px-1">
              {registrosFiltrados.length} de {registros.length} registro{registros.length !== 1 ? 's' : ''}
            </p>
          )}
          {registrosFiltrados.map((r) => {
            const mudancas = CAMPOS_RELEVANTES.filter(({ chave }) => {
              if (r.acao === 'excluido') return r.antes[chave] !== undefined && r.antes[chave] !== null;
              return JSON.stringify(r.antes[chave]) !== JSON.stringify(r.depois?.[chave]);
            });
            return (
              <div key={r.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-center gap-2 mb-2">
                  {r.acao === 'excluido' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded-md"><Trash2 size={11} /> Excluído</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-md"><Pencil size={11} /> Editado</span>
                  )}
                  <span className="text-xs text-slate-400 dark:text-slate-500">{fmtDateHora(r.created_at)}</span>
                </div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">{r.antes.descricao}</p>
                {r.acao === 'excluido' ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{currency(Number(r.antes.valor))} · {r.antes.data ? new Date(r.antes.data + 'T00:00:00').toLocaleDateString('pt-BR') : ''} · {r.antes.categoria}</p>
                ) : mudancas.length > 0 ? (
                  <div className="space-y-1">
                    {mudancas.map(({ chave, label, formato }) => (
                      <p key={chave} className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-medium">{label}:</span>{' '}
                        <span className="line-through text-rose-500/80">{formatarValor(r.antes[chave], formato)}</span>
                        {' → '}
                        <span className="text-emerald-600">{formatarValor(r.depois?.[chave], formato)}</span>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 dark:text-slate-500">Nenhum dos campos principais mudou (pode ter sido só a categoria vinculada ou outro campo interno).</p>
                )}
              </div>
            );
          })}
          {hasMore && (
            <button
              onClick={() => loadMore()}
              disabled={loadingMore}
              className="w-full mt-4 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg transition-colors"
            >
              {loadingMore ? 'Carregando...' : '📥 Carregar mais registros'}
            </button>
          )}
        </div>
      )}
    </main>
  );
}
