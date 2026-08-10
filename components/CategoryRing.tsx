'use client';

import { useEffect, useState } from 'react';
import { ICONS } from '@/lib/categorias';
import { Tag } from 'lucide-react';

export interface RingSlice {
  name: string;
  value: number;
  color: string;
  icone?: string;
}

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Anel de categorias com os ícones "flutuando" na borda — inspirado em apps
// como o Oinc, troca o donut chart tradicional (que só mostra cor + legenda
// separada) por algo que já identifica a categoria visualmente no gráfico.
export default function CategoryRing({
  data,
  size = 240,
  thickness = 26,
  label = 'Gasto total',
}: {
  data: RingSlice[];
  size?: number;
  thickness?: number;
  label?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = data.length > 1 ? 5 : 0;
  const cx = size / 2;
  const cy = size / 2;

  // Anima do zero até o valor real ao montar — dá a sensação de "preenchendo"
  // em vez de aparecer pronto, como o resto do app agora faz com os números.
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setProgress(1));
    return () => cancelAnimationFrame(raf);
  }, [data.length]);

  const iconR = size / 2;
  // Categorias pequenas (poucos % do total) ficam com o ícone muito perto do
  // vizinho e um esconde o outro — afasta os ícones no mínimo o suficiente
  // para não sobrepor, sem mexer no tamanho real dos segmentos do anel.
  const minIconGap = Math.min((28 + 6) / iconR, data.length > 0 ? (2 * Math.PI) / data.length : Infinity);

  let cumulative = 0;
  const rawSegments = data.map((d) => {
    const pct = total > 0 ? d.value / total : 0;
    const startPct = cumulative;
    cumulative += pct;
    const arcLength = Math.max(0, pct * circumference - gap);
    return { ...d, pct, startPct, arcLength, rawAngle: (startPct + pct / 2) * 2 * Math.PI };
  });

  let prevAngle = -Infinity;
  const segments = rawSegments.map((s) => {
    const angle = Math.max(s.rawAngle, prevAngle + minIconGap);
    prevAngle = angle;
    const iconAngle = angle - Math.PI / 2;
    return {
      ...s,
      dasharray: `${s.arcLength * progress} ${circumference}`,
      dashoffset: -s.startPct * circumference,
      ix: cx + iconR * Math.cos(iconAngle),
      iy: cy + iconR * Math.sin(iconAngle),
    };
  });

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 transition-all">
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--chart-grid)" strokeWidth={thickness} />
        {segments.map((s, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={s.color}
            strokeWidth={thickness}
            strokeDasharray={s.dasharray}
            strokeDashoffset={s.dashoffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.8s ease-out' }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
        <span className="text-xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">{currency(total)}</span>
      </div>
      {segments.filter((s) => s.value > 0).map((s, i) => {
        const Icon = s.icone ? ICONS[s.icone] : null;
        return (
          <div
            key={i}
            className="absolute w-7 h-7 rounded-full flex items-center justify-center shadow-sm border-2 border-white dark:border-slate-800 transition-transform"
            style={{
              left: s.ix - 14,
              top: s.iy - 14,
              backgroundColor: s.color,
              transform: `scale(${progress})`,
              transitionDelay: `${0.5 + i * 0.05}s`,
            }}
            title={`${s.name} — ${currency(s.value)}`}
          >
            {Icon ? <Icon size={13} className="text-white" /> : <Tag size={13} className="text-white" />}
          </div>
        );
      })}
    </div>
  );
}
