'use client';

import { useState, type ReactNode } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { ICONS } from '@/lib/categorias';

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export interface DonutSlice {
  name: string;
  value: number;
  color: string;
  icone?: string;
}

function DonutTooltip({ active, payload, total }: any) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0].payload as DonutSlice;
  const pct = total > 0 ? (item.value / total) * 100 : 0;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 shadow-lg text-xs">
      <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200 mb-0.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
        {item.name}
      </div>
      <p className="text-slate-500 dark:text-slate-400">{currency(item.value)} · {pct.toFixed(1)}%</p>
    </div>
  );
}

// Donut de categorias reutilizado nas visões Mensal e Anual: total (ou
// categoria em foco) no centro, tooltip com percentual, e legenda com barra
// de progresso sincronizada por hover com a fatia correspondente.
export default function CategoriaDonutChart({
  data,
  totalLabel = 'Total',
  height = 260,
  sideBySide = false,
  renderRowExtra,
}: {
  data: DonutSlice[];
  totalLabel?: string;
  height?: number;
  sideBySide?: boolean;
  renderRowExtra?: (item: DonutSlice, index: number) => ReactNode;
}) {
  const [active, setActive] = useState<number | null>(null);
  const total = data.reduce((s, c) => s + c.value, 0);

  return (
    <div className={`grid grid-cols-1 gap-6 items-center ${sideBySide ? 'md:grid-cols-2' : ''}`}>
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={68}
              outerRadius={104}
              paddingAngle={3}
              cornerRadius={6}
              stroke="none"
              onMouseEnter={(_: any, i: number) => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.color}
                  opacity={active === null || active === i ? 1 : 0.35}
                  style={{ transition: 'opacity 150ms ease' }}
                />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
          <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-full">{active !== null ? data[active].name : totalLabel}</p>
          <p className="text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100">
            {currency(active !== null ? data[active].value : total)}
          </p>
        </div>
      </div>
      <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
        {data.map((c, i) => {
          const pct = total > 0 ? (c.value / total) * 100 : 0;
          const Icon = c.icone ? ICONS[c.icone] : null;
          return (
            <div
              key={i}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              className={`flex items-center gap-3 px-2 py-1.5 rounded-lg cursor-default transition-colors ${active === i ? 'bg-slate-50 dark:bg-slate-700/60' : ''}`}
            >
              {Icon ? (
                <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: c.color }}>
                  <Icon size={12} className="text-white" />
                </span>
              ) : (
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">{c.name}</span>
                  {renderRowExtra && <span className="flex items-center gap-1.5 shrink-0">{renderRowExtra(c, i)}</span>}
                  <span className="text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200 shrink-0 ml-auto">{currency(c.value)}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} />
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums w-9 text-right">{pct.toFixed(0)}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
