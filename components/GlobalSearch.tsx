'use client';

import { useState, useMemo } from 'react';
import { Search, X, Wallet, Tag, Building2, FileText, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Lancamento, Categoria, ContaBancaria, ContaPagar, ContaReceber } from '@/lib/supabase';

interface SearchResults {
  lancamentos: Lancamento[];
  categorias: Categoria[];
  contas: ContaBancaria[];
  contas_pagar: ContaPagar[];
  contas_receber: ContaReceber[];
}

export default function GlobalSearch({ userId, onSelectLancamento }: { userId: string; onSelectLancamento?: (l: Lancamento) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'todos' | 'lancamentos' | 'categorias' | 'contas' | 'pendentes'>('todos');
  const [results, setResults] = useState<SearchResults>({ lancamentos: [], categorias: [], contas: [], contas_pagar: [], contas_receber: [] });
  const [loading, setLoading] = useState(false);

  const handleSearch = async (query: string) => {
    setSearch(query);
    if (!query.trim()) {
      setResults({ lancamentos: [], categorias: [], contas: [], contas_pagar: [], contas_receber: [] });
      return;
    }

    setLoading(true);
    try {
      const q = `%${query}%`;
      const [lancRes, catRes, contasRes, pagarRes, receberRes] = await Promise.all([
        supabase.from('lancamentos').select('*').eq('user_id', userId).ilike('descricao', q).limit(10),
        supabase.from('categorias').select('*').eq('user_id', userId).ilike('nome', q).limit(10),
        supabase.from('contas_bancarias').select('*').eq('user_id', userId).ilike('nome', q).limit(10),
        supabase.from('contas_pagar').select('*').eq('user_id', userId).ilike('descricao', q).eq('status', 'pendente').limit(10),
        supabase.from('contas_receber').select('*').eq('user_id', userId).ilike('descricao', q).eq('status', 'pendente').limit(10),
      ]);

      setResults({
        lancamentos: lancRes.data || [],
        categorias: catRes.data || [],
        contas: contasRes.data || [],
        contas_pagar: pagarRes.data || [],
        contas_receber: receberRes.data || [],
      });
    } catch (err) {
      console.error('Erro na busca:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalResults = results.lancamentos.length + results.categorias.length + results.contas.length + results.contas_pagar.length + results.contas_receber.length;

  const filteredResults = useMemo(() => {
    switch (tab) {
      case 'lancamentos':
        return { lancamentos: results.lancamentos, categorias: [], contas: [], contas_pagar: [], contas_receber: [] };
      case 'categorias':
        return { lancamentos: [], categorias: results.categorias, contas: [], contas_pagar: [], contas_receber: [] };
      case 'contas':
        return { lancamentos: [], categorias: [], contas: results.contas, contas_pagar: [], contas_receber: [] };
      case 'pendentes':
        return { lancamentos: [], categorias: [], contas: [], contas_pagar: results.contas_pagar, contas_receber: results.contas_receber };
      default:
        return results;
    }
  }, [tab, results]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-xs text-slate-600 dark:text-slate-400 transition-colors"
      >
        <Search size={14} />
        Buscar...
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[70vh] flex flex-col border border-slate-200 dark:border-slate-700">
            {/* Header com Input */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Buscar lançamentos, categorias, contas, débitos..."
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full pl-9 pr-9 py-2.5 bg-transparent border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button onClick={() => setOpen(false)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            {search && (
              <div className="flex border-b border-slate-200 dark:border-slate-700 px-4 gap-1 overflow-x-auto">
                {[
                  { id: 'todos', label: `Tudo (${totalResults})` },
                  { id: 'lancamentos', label: `Lançamentos (${results.lancamentos.length})` },
                  { id: 'categorias', label: `Categorias (${results.categorias.length})` },
                  { id: 'contas', label: `Contas (${results.contas.length})` },
                  { id: 'pendentes', label: `Pendentes (${results.contas_pagar.length + results.contas_receber.length})` },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id as any)}
                    className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                      tab === t.id
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            {/* Resultados */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading && <p className="text-xs text-slate-400 text-center py-8">Procurando...</p>}

              {!search && !loading && (
                <div className="text-center py-12">
                  <Search size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">Digite para buscar</p>
                </div>
              )}

              {search && !loading && totalResults === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum resultado encontrado</p>
                </div>
              )}

              {/* Lançamentos */}
              {filteredResults.lancamentos.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 px-2 flex items-center gap-2">
                    <FileText size={13} /> Lançamentos
                  </h3>
                  <div className="space-y-1">
                    {filteredResults.lancamentos.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => {
                          onSelectLancamento?.(l);
                          setOpen(false);
                        }}
                        className="w-full text-left p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors group"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{l.descricao}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{l.data} · {l.categoria}</p>
                          </div>
                          <p className={`text-sm font-semibold whitespace-nowrap tabular-nums ${l.tipo === 'entrada' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {l.tipo === 'entrada' ? '+' : '-'}R${Math.abs(Number(l.valor)).toFixed(2).replace('.', ',')}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Categorias */}
              {filteredResults.categorias.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 px-2 flex items-center gap-2">
                    <Tag size={13} /> Categorias
                  </h3>
                  <div className="space-y-1">
                    {filteredResults.categorias.map((c) => (
                      <button
                        key={c.id}
                        className="w-full text-left p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{c.nome}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{c.tipo}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Contas Bancárias */}
              {filteredResults.contas.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 px-2 flex items-center gap-2">
                    <Wallet size={13} /> Contas Bancárias
                  </h3>
                  <div className="space-y-1">
                    {filteredResults.contas.map((c) => (
                      <button key={c.id} className="w-full text-left p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{c.nome}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{c.banco}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Contas Pendentes */}
              {filteredResults.contas_pagar.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 px-2 flex items-center gap-2">
                    <Building2 size={13} /> A Pagar
                  </h3>
                  <div className="space-y-1">
                    {filteredResults.contas_pagar.map((c) => (
                      <button key={c.id} className="w-full text-left p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{c.descricao}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{c.data_vencimento}</p>
                          </div>
                          <p className="text-sm font-semibold text-rose-600 tabular-nums">R${Number(c.valor).toFixed(2).replace('.', ',')}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filteredResults.contas_receber.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 px-2 flex items-center gap-2">
                    <Building2 size={13} /> A Receber
                  </h3>
                  <div className="space-y-1">
                    {filteredResults.contas_receber.map((c) => (
                      <button key={c.id} className="w-full text-left p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{c.descricao}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{c.data_vencimento}</p>
                          </div>
                          <p className="text-sm font-semibold text-emerald-600 tabular-nums">R${Number(c.valor).toFixed(2).replace('.', ',')}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
