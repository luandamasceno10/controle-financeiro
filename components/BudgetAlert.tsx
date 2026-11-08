'use client';

import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { OrcamentoCategoria, Lancamento, Categoria } from '@/lib/supabase';

export default function BudgetAlert({
  lancamentos,
  orcamentos,
  categorias,
  currentMonth,
}: {
  lancamentos: Lancamento[];
  orcamentos: OrcamentoCategoria[];
  categorias: Categoria[];
  currentMonth: string;
}) {
  const alerts = useMemo(() => {
    const alrts: Array<{ tipo: 'excedido' | 'risco'; categoria: string; pct: number; valor: number; limite: number }> = [];

    for (const orc of orcamentos) {
      const gastos = lancamentos
        .filter((l) => {
          const [ano, mes] = currentMonth.split('-');
          const [lAno, lMes] = l.data.split('-');
          return l.tipo === 'saida' && l.categoria_id === orc.categoria_id && ano === lAno && mes === lMes;
        })
        .reduce((sum, l) => sum + Math.abs(Number(l.valor)), 0);

      const categoria = categorias.find((c) => c.id === orc.categoria_id);
      const nomCategoria = categoria?.nome || 'Sem nome';
      const limite = Number(orc.valor_limite);
      const pct = (gastos / limite) * 100;

      if (pct >= 100) {
        alrts.push({ tipo: 'excedido', categoria: nomCategoria, pct, valor: gastos, limite });
      } else if (pct >= 80) {
        alrts.push({ tipo: 'risco', categoria: nomCategoria, pct, valor: gastos, limite });
      }
    }

    return alrts.sort((a, b) => b.pct - a.pct);
  }, [lancamentos, orcamentos, categorias, currentMonth]);

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.categoria}
          className={`rounded-lg border p-3 flex items-start gap-3 ${
            alert.tipo === 'excedido'
              ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20'
              : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20'
          }`}
        >
          <AlertTriangle
            size={16}
            className={`flex-shrink-0 mt-0.5 ${alert.tipo === 'excedido' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}
          />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${alert.tipo === 'excedido' ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300'}`}>
              {alert.tipo === 'excedido' ? '⚠️ Orçamento excedido' : '📊 Orçamento em risco'}
            </p>
            <p className={`text-xs mt-0.5 ${alert.tipo === 'excedido' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
              <strong>{alert.categoria}</strong>: R${alert.valor.toFixed(2).replace('.', ',')} de R${alert.limite.toFixed(2).replace('.', ',')} ({Math.round(alert.pct)}%)
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
