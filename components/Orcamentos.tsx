'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Categoria, OrcamentoCategoria, Lancamento } from '@/lib/supabase';
import { useToast, ToastContainer } from './Toast';
import { sortCategoriasNatural } from '@/lib/categorias';
import { Wallet, Check, X, AlertTriangle, ChevronLeft, ChevronRight, PieChart } from 'lucide-react';

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function monthLabel(mes: string) {
  const [y, m] = mes.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} de ${y}`;
}

function shiftMonth(mes: string, delta: number) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Orcamentos({ userId }: { userId: string }) {
  const { toasts, addToast, removeToast } = useToast();

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [orcamentos, setOrcamentos] = useState<OrcamentoCategoria[]>([]);
  const [entries, setEntries] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [mes, setMes] = useState(currentMonth());

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [catResult, orcResult, entriesResult] = await Promise.all([
        supabase.from('categorias').select('*').eq('user_id', userId).eq('tipo', 'saida').eq('ativa', true).order('ordem'),
        supabase.from('orcamentos_categoria').select('*').eq('user_id', userId),
        supabase.from('lancamentos').select('*').eq('user_id', userId).eq('tipo', 'saida'),
      ]);
      if (catResult.data) setCategorias(catResult.data);
      if (orcResult.data) setOrcamentos(orcResult.data);
      if (entriesResult.data) setEntries(entriesResult.data);
    } catch (err: any) {
      addToast('Erro ao carregar orçamentos: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const gastoPorCategoria = useMemo(() => {
    const map: Record<number, number> = {};
    entries.filter((e) => e.data.startsWith(mes) && e.categoria_id).forEach((e) => {
      map[e.categoria_id as number] = (map[e.categoria_id as number] || 0) + Number(e.valor);
    });
    return map;
  }, [entries, mes]);

  const orcamentoPorCategoria = useMemo(() => {
    const map: Record<number, OrcamentoCategoria> = {};
    orcamentos.forEach((o) => { map[o.categoria_id] = o; });
    return map;
  }, [orcamentos]);

  const totalLimite = useMemo(() => orcamentos.reduce((s, o) => s + Number(o.valor_limite), 0), [orcamentos]);
  const totalGasto = useMemo(
    () => orcamentos.reduce((s, o) => s + (gastoPorCategoria[o.categoria_id] || 0), 0),
    [orcamentos, gastoPorCategoria]
  );
  const totalPct = totalLimite > 0 ? Math.round((totalGasto / totalLimite) * 100) : 0;

  const openEdit = (categoriaId: number) => {
    setEditingId(categoriaId);
    setInputValue(orcamentoPorCategoria[categoriaId] ? String(orcamentoPorCategoria[categoriaId].valor_limite) : '');
  };

  const saveOrcamento = async (categoriaId: number) => {
    setSaving(true);
    try {
      if (!inputValue) {
        const existing = orcamentoPorCategoria[categoriaId];
        if (existing) await supabase.from('orcamentos_categoria').delete().eq('id', existing.id);
      } else {
        const valor = parseFloat(inputValue);
        const existing = orcamentoPorCategoria[categoriaId];
        if (existing) {
          await supabase.from('orcamentos_categoria').update({ valor_limite: valor }).eq('id', existing.id);
        } else {
          await supabase.from('orcamentos_categoria').insert([{ user_id: userId, categoria_id: categoriaId, valor_limite: valor }]);
        }
      }
      await loadData();
      addToast('Orçamento salvo!', 'success');
      setEditingId(null);
    } catch (err: any) {
      addToast('Erro ao salvar: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-5 py-8 space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center">
          <Wallet size={16} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Orçamento por Categoria</h1>
          <p className="text-xs text-slate-400">Defina um limite mensal e acompanhe o quanto já gastou</p>
        </div>
      </div>

      <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-4 py-3">
        <button onClick={() => setMes((m) => shiftMonth(m, -1))} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><ChevronLeft size={16} /></button>
        <span className="text-sm font-semibold text-slate-700 capitalize">{monthLabel(mes)}</span>
        <button onClick={() => setMes((m) => shiftMonth(m, 1))} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><ChevronRight size={16} /></button>
      </div>

      {!loading && totalLimite > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center"><PieChart size={16} /></div>
            <div>
              <h2 className="text-sm font-semibold text-slate-700">Total orçado no mês</h2>
              <p className="text-xs text-slate-400">Soma de todos os limites definidos</p>
            </div>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all ${totalGasto > totalLimite ? 'bg-rose-500' : (totalPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500')}`}
              style={{ width: `${Math.min(100, totalPct)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">{currency(totalGasto)} de {currency(totalLimite)}</span>
            <span className={`font-semibold ${totalGasto > totalLimite ? 'text-rose-600' : 'text-slate-600'}`}>{totalPct}%</span>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Carregando...</div>
        ) : categorias.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Nenhuma categoria de saída cadastrada ainda.</div>
        ) : (
          sortCategoriasNatural(categorias).map((cat) => {
            const gasto = gastoPorCategoria[cat.id] || 0;
            const orc = orcamentoPorCategoria[cat.id];
            const limite = orc ? Number(orc.valor_limite) : null;
            const pct = limite ? Math.min(100, Math.round((gasto / limite) * 100)) : null;
            const estourou = limite !== null && gasto > limite;
            const isEditing = editingId === cat.id;

            return (
              <div key={cat.id} className="px-4 py-3.5">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold text-slate-700 truncate">{cat.nome}</span>
                  </div>
                  {isEditing ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        step="0.01"
                        autoFocus
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Sem limite"
                        className="w-28 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-800"
                        disabled={saving}
                      />
                      <button onClick={() => saveOrcamento(cat.id)} disabled={saving} className="p-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white"><Check size={13} /></button>
                      <button onClick={() => setEditingId(null)} disabled={saving} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={13} /></button>
                    </div>
                  ) : (
                    <button onClick={() => openEdit(cat.id)} className="text-xs font-medium text-slate-500 hover:text-slate-800 shrink-0">
                      {limite ? `Limite: ${currency(limite)}` : 'Definir limite'}
                    </button>
                  )}
                </div>

                {limite !== null && (
                  <>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${estourou ? 'bg-rose-500' : (pct || 0) >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-slate-400">{currency(gasto)} de {currency(limite)}</span>
                      {estourou ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600"><AlertTriangle size={11} /> Estourou {currency(gasto - limite)}</span>
                      ) : (
                        <span className="text-xs font-medium text-slate-500">{pct}%</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
