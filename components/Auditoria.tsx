'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { LancamentoAuditoria } from '@/lib/supabase';
import { SkeletonList } from './Skeleton';
import { History, Pencil, Trash2 } from 'lucide-react';

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

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('lancamentos_auditoria')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) setErro(error.message);
      else setRegistros(data || []);
      setLoading(false);
    })();
  }, [userId]);

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
      ) : (
        <div className="space-y-3">
          {registros.map((r) => {
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
        </div>
      )}
    </main>
  );
}
