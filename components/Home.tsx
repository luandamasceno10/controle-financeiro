'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { ContaPagar } from '@/lib/supabase';
import { Plus, LayoutDashboard, Landmark, CreditCard, Target, Tag, CalendarClock, Receipt } from 'lucide-react';

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

const SHORTCUTS = [
  { href: '/dashboard', label: 'Dashboard completo', description: 'Saldo, gráficos e extrato', icon: LayoutDashboard, tone: 'slate' },
  { href: '/contas', label: 'Contas Bancárias', description: 'Cadastre suas contas', icon: Landmark, tone: 'blue' },
  { href: '/cartoes', label: 'Cartões de Crédito', description: 'Fatura e vencimento', icon: CreditCard, tone: 'violet' },
  { href: '/metas', label: 'Metas', description: 'Seus objetivos financeiros', icon: Target, tone: 'emerald' },
  { href: '/categorias', label: 'Categorias', description: 'Gerencie suas categorias', icon: Tag, tone: 'amber' },
];

const TONE_CLASSES: Record<string, string> = {
  slate: 'bg-slate-50 text-slate-600',
  blue: 'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
};

export default function Home({ userId, nome }: { userId: string; nome?: string }) {
  const [loading, setLoading] = useState(true);
  const [entriesThisMonth, setEntriesThisMonth] = useState(0);
  const [nextBill, setNextBill] = useState<ContaPagar | null>(null);

  useEffect(() => {
    const load = async () => {
      const now = new Date();
      const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const [entriesResult, billsResult] = await Promise.all([
        supabase.from('lancamentos').select('id, data').eq('user_id', userId),
        supabase.from('contas_pagar').select('*').eq('user_id', userId).eq('status', 'pendente').order('vencimento', { ascending: true }).limit(1),
      ]);

      if (entriesResult.data) {
        setEntriesThisMonth(entriesResult.data.filter((e: any) => e.data.startsWith(monthPrefix)).length);
      }
      if (billsResult.data && billsResult.data.length > 0) {
        setNextBill(billsResult.data[0]);
      }
      setLoading(false);
    };
    load();
  }, [userId]);

  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  return (
    <main className="max-w-3xl mx-auto px-5 py-8 space-y-6">
      <div>
        <p className="text-xs text-slate-400 capitalize">{hoje}</p>
        <h1 className="text-xl font-semibold text-slate-800">Olá{nome ? `, ${nome}` : ''}! 👋</h1>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center mb-2">
            <Receipt size={15} />
          </div>
          <p className="text-xs text-slate-400">Lançamentos este mês</p>
          <p className="text-lg font-semibold text-slate-800">{loading ? '—' : entriesThisMonth}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center mb-2">
            <CalendarClock size={15} />
          </div>
          <p className="text-xs text-slate-400">Próxima conta</p>
          {loading ? (
            <p className="text-lg font-semibold text-slate-800">—</p>
          ) : nextBill ? (
            <p className="text-sm font-semibold text-slate-800 truncate">{nextBill.descricao} · {fmtDate(nextBill.vencimento)}</p>
          ) : (
            <p className="text-sm text-slate-400">Nenhuma pendente</p>
          )}
        </div>
      </div>

      <Link
        href="/dashboard"
        className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold text-sm px-4 py-3 rounded-lg transition-colors"
      >
        <Plus size={16} strokeWidth={2.5} /> Novo lançamento
      </Link>

      <div className="space-y-2">
        {SHORTCUTS.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-colors"
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${TONE_CLASSES[s.tone]}`}>
                <Icon size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-700">{s.label}</p>
                <p className="text-xs text-slate-400">{s.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
