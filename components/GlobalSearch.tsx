'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Lancamento, Categoria } from '@/lib/supabase';
import { ICONS } from '@/lib/categorias';
import { Search, QrCode, CreditCard, Loader } from 'lucide-react';

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function GlobalSearch({ userId }: { userId: string }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Lancamento[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    supabase.from('categorias').select('*').eq('user_id', userId).then(({ data }) => {
      if (data) setCategorias(data);
    });
  }, [userId]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(async () => {
      // Busca sem limite de período — é justamente o ponto: encontrar um
      // lançamento de qualquer época, não só do mês/ano em exibição no Dashboard.
      const { data } = await supabase
        .from('lancamentos')
        .select('*')
        .eq('user_id', userId)
        .ilike('descricao', `%${q}%`)
        .order('data', { ascending: false })
        .limit(100);
      setResults(data || []);
      setSearching(false);
      setSearched(true);
    }, 350);
    return () => clearTimeout(timeout);
  }, [query, userId]);

  const categoriaByName = useMemo(() => {
    const map: Record<string, Categoria> = {};
    categorias.forEach((c) => { map[`${c.tipo}|${c.nome}`] = c; });
    return map;
  }, [categorias]);

  return (
    <main className="max-w-2xl mx-auto px-5 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center">
          <Search size={16} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Buscar lançamentos</h1>
          <p className="text-xs text-slate-400 dark:text-slate-500">Procura em todo o histórico, não só no mês em exibição</p>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600" />
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Digite ao menos 2 letras da descrição..."
          className="w-full border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100"
        />
      </div>

      {searching && (
        <div className="flex items-center justify-center gap-2 text-sm text-slate-400 dark:text-slate-500 py-8">
          <Loader size={14} className="animate-spin" /> Buscando...
        </div>
      )}

      {!searching && searched && results.length === 0 && (
        <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-8">Nenhum lançamento encontrado para "{query}".</p>
      )}

      {!searching && results.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
          {results.map((e) => {
            const catObj = categoriaByName[`${e.tipo}|${e.categoria}`];
            const CatIcon = catObj ? ICONS[catObj.icone] : null;
            const PayIcon = e.forma_pagamento === 'pix' ? QrCode : CreditCard;
            return (
              <Link
                key={e.id}
                href={`/dashboard?mes=${e.data.slice(0, 7)}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ color: catObj?.cor, backgroundColor: `${catObj?.cor || '#64748B'}15` }}
                >
                  {CatIcon ? <CatIcon size={14} /> : <Search size={14} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{e.descricao}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                    {fmtDate(e.data)} · {e.categoria} · <PayIcon size={11} className="inline" />
                  </p>
                </div>
                <span className={`text-sm font-semibold tabular-nums shrink-0 ${e.tipo === 'entrada' ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-200'}`}>
                  {e.tipo === 'entrada' ? '+' : '-'}{currency(Number(e.valor))}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
