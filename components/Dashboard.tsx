'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Lancamento, ContaPagar, ContaReceber, Previsao, Categoria, ContaBancaria, CartaoCredito, OrcamentoCategoria, Meta } from '@/lib/supabase';
import { ICONS } from '@/lib/categorias';
import { sortByDataHora } from '@/lib/sort';
import { exportLancamentosCSV, exportLancamentosPDF } from '@/lib/export';
import { useToast, ToastContainer } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';
import LancamentoForm from './LancamentoForm';
import CategoryRing from './CategoryRing';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line
} from 'recharts';
import {
  Plus, Wallet, CreditCard, QrCode, ChevronDown, X, Trash2, Pencil,
  ArrowUpRight, ArrowDownRight, CircleEllipsis,
  Calendar, ChevronLeft, ChevronRight,
  Target, TrendingUp, BarChart3, Inbox, Loader, Search, FileDown, FileText, Paperclip, Info
} from 'lucide-react';

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTH_NAMES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

export default function Dashboard({ userId }: { userId: string }) {
  const { toasts, addToast, removeToast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [entries, setEntries] = useState<Lancamento[]>([]);
  const [payable, setPayable] = useState<ContaPagar[]>([]);
  const [receivable, setReceivable] = useState<ContaReceber[]>([]);
  const [forecast, setForecast] = useState<Record<string, number>>({});
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [cartoes, setCartoes] = useState<CartaoCredito[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [orcamentos, setOrcamentos] = useState<OrcamentoCategoria[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('mensal');
  const [saldoPorConta, setSaldoPorConta] = useState<Record<number, number>>({});
  const [hasAnyEntry, setHasAnyEntry] = useState(false);
  const [patrimonioEvolucao, setPatrimonioEvolucao] = useState<{ mes: number; saldo: number }[]>([]);

  const now = new Date();
  // Vindo da busca global (?mes=YYYY-MM), abre o Dashboard já no mês do
  // lançamento encontrado, em vez de sempre no mês atual.
  const mesFromUrl = searchParams.get('mes');
  const [currentYear, setCurrentYear] = useState(() => mesFromUrl ? Number(mesFromUrl.slice(0, 4)) : now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => {
    return mesFromUrl || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    if (mesFromUrl) router.replace(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Lancamento | null>(null);
  const [showCardDetail, setShowCardDetail] = useState(false);
  const [editingForecast, setEditingForecast] = useState(false);
  const [forecastInput, setForecastInput] = useState('');

  const [filterPayment, setFilterPayment] = useState('todos');
  const [filterCategory, setFilterCategory] = useState('todas');
  const [filterType, setFilterType] = useState('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'lancamento'; id: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [savingForecast, setSavingForecast] = useState(false);

  useEffect(() => {
    loadData();
  }, [userId, currentYear]);

  const loadData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      // O histórico completo de lançamentos só é necessário pro saldo (livro-razão
      // cumulativo, nunca reinicia) — isso é resolvido no banco via RPC (soma
      // agregada, não traz linha por linha). A tabela em si só carrega o ano em
      // exibição, pra não crescer sem limite conforme o histórico do usuário aumenta.
      const anoInicio = `${currentYear}-01-01`;
      const anoFim = `${currentYear}-12-31`;
      const [lancResult, pagarResult, receberResult, previsaoResult, contasResult, cartoesResult, categoriasResult, orcamentosResult, metasResult] = await Promise.all([
        supabase.from('lancamentos').select('*').eq('user_id', userId).gte('data', anoInicio).lte('data', anoFim),
        supabase.from('contas_pagar').select('*').eq('user_id', userId),
        supabase.from('contas_receber').select('*').eq('user_id', userId),
        supabase.from('previsoes').select('*').eq('user_id', userId),
        supabase.from('contas_bancarias').select('*').eq('user_id', userId).eq('ativa', true),
        supabase.from('cartoes_credito').select('*').eq('user_id', userId).eq('ativo', true),
        supabase.from('categorias').select('*').eq('user_id', userId).eq('ativa', true).order('ordem'),
        supabase.from('orcamentos_categoria').select('*').eq('user_id', userId),
        supabase.from('metas').select('*').eq('user_id', userId).eq('status', 'ativa'),
      ]);

      if (lancResult.data) setEntries(lancResult.data);
      if (pagarResult.data) setPayable(pagarResult.data);
      if (receberResult.data) setReceivable(receberResult.data);
      if (previsaoResult.data) {
        const f: Record<string, number> = {};
        previsaoResult.data.forEach((p: Previsao) => {
          f[p.mes] = p.valor_previsto;
        });
        setForecast(f);
      }
      if (contasResult.data) setContas(contasResult.data);
      if (cartoesResult.data) setCartoes(cartoesResult.data);
      if (categoriasResult.data) setCategorias(categoriasResult.data);
      if (orcamentosResult.data) setOrcamentos(orcamentosResult.data);
      if (metasResult.data) setMetas(metasResult.data);

      if (!hasAnyEntry) {
        const { count } = await supabase.from('lancamentos').select('id', { count: 'exact', head: true }).eq('user_id', userId);
        setHasAnyEntry((count ?? 0) > 0);
      }
    } catch (error: any) {
      addToast('Erro ao carregar dados: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Salvar/editar/apagar um lançamento não muda contas, cartões, categorias,
  // orçamentos ou previsões — só a tabela lancamentos. Recarregar só ela (em
  // vez das 8 queries de loadData) deixa a UI bem mais rápida após "Salvar".
  const refreshEntries = async () => {
    const anoInicio = `${currentYear}-01-01`;
    const anoFim = `${currentYear}-12-31`;
    const { data } = await supabase.from('lancamentos').select('*').eq('user_id', userId).gte('data', anoInicio).lte('data', anoFim);
    if (data) setEntries(data);
  };

  // Saldo é um livro-razão cumulativo (nunca reinicia no ano) — em vez de baixar
  // todo o histórico de lançamentos pra somar em JS, a soma é feita no banco via
  // RPC. Roda à parte do loadData principal porque o corte é por mês selecionado
  // (currentMonth), granularidade mais fina do que o ano carregado na tabela.
  useEffect(() => {
    const [y, m] = currentMonth.split('-').map(Number);
    const cutoff = `${y}-${String(m).padStart(2, '0')}-31`;
    supabase.rpc('saldo_por_conta', { p_cutoff: cutoff }).then(({ data }) => {
      if (!data) return;
      const map: Record<number, number> = {};
      data.forEach((r: { conta_id: number; saldo: number }) => { map[r.conta_id] = Number(r.saldo); });
      setSaldoPorConta(map);
    });
  }, [userId, currentMonth]);

  // Evolução patrimonial: saldo total acumulado ao fim de cada mês do ano
  // exibido — busca só quando a vista Anual está aberta (é o único lugar que usa).
  useEffect(() => {
    if (view !== 'anual') return;
    supabase.rpc('saldo_evolucao_mensal', { p_ano: currentYear }).then(({ data }) => {
      if (data) setPatrimonioEvolucao(data);
    });
  }, [userId, currentYear, view]);

  const categoriasSaida = useMemo(() => categorias.filter(c => c.tipo === 'saida'), [categorias]);
  const categoriasEntrada = useMemo(() => categorias.filter(c => c.tipo === 'entrada'), [categorias]);
  const categoriaByName = useMemo(() => {
    const map: Record<string, Categoria> = {};
    categorias.forEach(c => { map[`${c.tipo}|${c.nome}`] = c; });
    return map;
  }, [categorias]);

  const catMeta = (nome: string, tipo: 'entrada' | 'saida' = 'saida'): { color: string } | undefined => {
    const c = categoriaByName[`${tipo}|${nome}`];
    return c ? { color: c.cor } : undefined;
  };

  const categoriaById = useMemo(() => {
    const map: Record<number, Categoria> = {};
    categorias.forEach(c => { map[c.id] = c; });
    return map;
  }, [categorias]);

  // Para agrupamentos por categoria (gráficos), o gasto de uma subcategoria
  // deve somar na categoria-pai, não aparecer como uma fatia própria.
  const rollupCategoriaNome = (nome: string, tipo: 'entrada' | 'saida' = 'saida'): string => {
    const c = categoriaByName[`${tipo}|${nome}`];
    if (c?.parent_id) return categoriaById[c.parent_id]?.nome || nome;
    return nome;
  };

  const monthEntries = useMemo(
    () => entries.filter(e => monthKey(e.data) === currentMonth),
    [entries, currentMonth]
  );

  const totals = useMemo(() => {
    // Compras no cartão só entram como saída de verdade quando a fatura é paga
    // (vira um lançamento sem cartao_id) — contá-las aqui de novo duplicaria o gasto.
    const entrada = monthEntries.filter(e => e.tipo === 'entrada').reduce((s, e) => s + Number(e.valor), 0);
    const saida = monthEntries.filter(e => e.tipo === 'saida' && !e.cartao_id).reduce((s, e) => s + Number(e.valor), 0);
    const pix = monthEntries.filter(e => e.forma_pagamento === 'pix' && e.tipo === 'saida' && !e.cartao_id).reduce((s, e) => s + Number(e.valor), 0);
    const cartao = monthEntries.filter(e => !!e.cartao_id && e.tipo === 'saida').reduce((s, e) => s + Number(e.valor), 0);
    return { entrada, saida, saldo: entrada - saida, pix, cartao };
  }, [monthEntries]);

  // Saldo real: soma dos saldos iniciais das contas bancárias + todos os
  // lançamentos vinculados a uma conta, até o fim do mês selecionado (inclusive).
  // Livro-razão cumulativo — não reinicia na virada do ano.
  const saldoAteMes = useMemo(() => {
    const base = contas.reduce((s, c) => s + Number(c.saldo_inicial), 0);
    const lancamentos = contas.reduce((s, c) => s + (saldoPorConta[c.id] || 0), 0);
    return base + lancamentos;
  }, [contas, saldoPorConta]);

  const carryOver = useMemo(() => saldoAteMes - totals.entrada + totals.saida, [saldoAteMes, totals]);

  const commitment = useMemo(() => {
    const saldoInicial = carryOver;
    const forecastValue = forecast[currentMonth] || 0;
    const disponivel = saldoInicial + totals.entrada - totals.saida;
    const recursosPlanejados = saldoInicial + forecastValue;
    const pct = recursosPlanejados > 0 ? Math.min(Math.round((totals.saida / recursosPlanejados) * 100), 999) : null;
    return {
      disponivel,
      forecastValue,
      pct,
      gasto: totals.saida,
      saldoInicial
    };
  }, [totals, forecast, currentMonth, carryOver]);

  const billTotals = useMemo(() => {
    const aPagar = payable.filter(p => p.status === 'pendente').reduce((s, p) => s + Number(p.valor), 0);
    const aReceber = receivable.filter(r => r.status === 'pendente').reduce((s, r) => s + Number(r.valor), 0);
    const saldoProjetado = commitment.disponivel + aReceber - aPagar;
    return { aPagar, aReceber, saldoProjetado };
  }, [payable, receivable, commitment.disponivel]);

  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    monthEntries.filter(e => e.tipo === 'saida' && !e.cartao_id).forEach(e => {
      const nome = rollupCategoriaNome(e.categoria, e.tipo);
      map[nome] = (map[nome] || 0) + Number(e.valor);
    });
    return Object.entries(map).map(([name, value]) => ({
      name, value, color: catMeta(name)?.color || '#64748B', icone: categoriaByName[`saida|${name}`]?.icone,
    })).sort((a, b) => b.value - a.value);
  }, [monthEntries, categoriaByName, categoriaById]);

  // Comparação com o mês anterior por categoria — só cobre lançamentos dentro
  // do ano em exibição (a tabela é carregada por ano); em janeiro, sem dados de
  // dezembro do ano anterior, a comparação fica indisponível para aquele mês.
  const categoryDataPrevMonth = useMemo(() => {
    const [y, m] = currentMonth.split('-').map(Number);
    const prevKey = m === 1 ? null : `${y}-${String(m - 1).padStart(2, '0')}`;
    if (!prevKey) return null;
    const map: Record<string, number> = {};
    entries.filter(e => monthKey(e.data) === prevKey && e.tipo === 'saida' && !e.cartao_id).forEach(e => {
      const nome = rollupCategoriaNome(e.categoria, e.tipo);
      map[nome] = (map[nome] || 0) + Number(e.valor);
    });
    return map;
  }, [entries, currentMonth, categoriaByName, categoriaById]);

  const orcamentoPorCategoriaId = useMemo(() => {
    const map: Record<number, number> = {};
    orcamentos.forEach((o) => { map[o.categoria_id] = Number(o.valor_limite); });
    return map;
  }, [orcamentos]);

  const limiteExcedido = (categoriaNome: string, valorGasto: number) => {
    const cat = categoriaByName[categoriaNome];
    if (!cat) return false;
    const limite = orcamentoPorCategoriaId[cat.id];
    return limite !== undefined && valorGasto > limite;
  };

  const paymentBarData = useMemo(() => {
    const grouped: Record<string, any> = {};
    monthEntries.filter(e => e.tipo === 'saida').forEach(e => {
      const nome = rollupCategoriaNome(e.categoria, e.tipo);
      if (!grouped[nome]) grouped[nome] = { category: nome, pix: 0, cartao: 0 };
      grouped[nome][e.forma_pagamento] += Number(e.valor);
    });
    return Object.values(grouped).sort((a, b) => (b.pix + b.cartao) - (a.pix + a.cartao));
  }, [monthEntries, categoriaByName, categoriaById]);

  const cardEntries = useMemo(
    () => monthEntries.filter(e => e.tipo === 'saida' && !!e.cartao_id).sort(sortByDataHora),
    [monthEntries]
  );

  const cardByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    cardEntries.forEach(e => { map[e.categoria] = (map[e.categoria] || 0) + Number(e.valor); });
    return Object.entries(map).map(([name, value]) => ({ name, value, color: catMeta(name)?.color || '#64748B' })).sort((a, b) => b.value - a.value);
  }, [cardEntries]);

  const cardTotal = useMemo(() => cardEntries.reduce((s, e) => s + Number(e.valor), 0), [cardEntries]);

  const filtered = useMemo(() => {
    return monthEntries
      .filter(e => filterPayment === 'todos' || e.forma_pagamento === filterPayment)
      .filter(e => filterCategory === 'todas' || e.categoria === filterCategory)
      .filter(e => filterType === 'todos' || e.tipo === filterType)
      .filter(e => e.descricao.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort(sortByDataHora);
  }, [monthEntries, filterPayment, filterCategory, filterType, searchQuery]);

  useEffect(() => { setPage(0); setSelectedIds(new Set()); }, [filterPayment, filterCategory, filterType, searchQuery, currentMonth]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(
    () => filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [filtered, page]
  );

  const yearData = useMemo(() => {
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${currentYear}-${String(m).padStart(2, '0')}`;
      const me = entries.filter(e => monthKey(e.data) === key);
      const entrada = me.filter(e => e.tipo === 'entrada').reduce((s, e) => s + Number(e.valor), 0);
      const saida = me.filter(e => e.tipo === 'saida' && !e.cartao_id).reduce((s, e) => s + Number(e.valor), 0);
      months.push({ key, label: MONTH_NAMES[m - 1], entrada, saida, saldo: entrada - saida });
    }
    return months;
  }, [entries, currentYear]);

  const yearTotals = useMemo(() => {
    const entrada = yearData.reduce((s, m) => s + m.entrada, 0);
    const saida = yearData.reduce((s, m) => s + m.saida, 0);
    return { entrada, saida, saldo: entrada - saida };
  }, [yearData]);

  const yearCategoryData = useMemo(() => {
    const map: Record<string, number> = {};
    entries.filter(e => monthKey(e.data).startsWith(String(currentYear)) && e.tipo === 'saida' && !e.cartao_id).forEach(e => {
      const nome = rollupCategoriaNome(e.categoria, e.tipo);
      map[nome] = (map[nome] || 0) + Number(e.valor);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value, color: catMeta(name)?.color || '#64748B' })).sort((a, b) => b.value - a.value);
  }, [entries, currentYear, categoriaByName, categoriaById]);

  const openNewEntry = () => {
    setEditingEntry(null);
    setShowForm(true);
  };

  const openEditEntry = (entry: Lancamento) => {
    setEditingEntry(entry);
    setShowForm(true);
  };

  const removeEntry = async (id: number) => {
    try {
      await supabase.from('lancamentos').delete().eq('id', id);
      await refreshEntries();
      addToast('Lançamento deletado', 'success');
    } catch (err: any) {
      addToast('Erro ao deletar: ' + err.message, 'error');
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeSelected = async () => {
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from('lancamentos').delete().in('id', ids);
      if (error) throw error;
      await refreshEntries();
      setSelectedIds(new Set());
      addToast(`${ids.length} lançamento${ids.length > 1 ? 's' : ''} deletado${ids.length > 1 ? 's' : ''}`, 'success');
    } catch (err: any) {
      addToast('Erro ao deletar: ' + err.message, 'error');
    } finally {
      setBulkDeleting(false);
      setBulkDeleteConfirm(false);
    }
  };

  const shiftMonth = (delta: number) => {
    const [year, month] = currentMonth.split('-').map(Number);
    let newMonth = month + delta;
    let newYear = year;

    if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    } else if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    }

    setCurrentMonth(`${newYear}-${String(newMonth).padStart(2, '0')}`);
  };

  const saveForecast = async () => {
    const v = parseFloat(forecastInput);
    if (!isNaN(v)) {
      setSavingForecast(true);
      try {
        // upsert evita corrida: dois salvamentos quase simultâneos não podem mais
        // ambos "não encontrar" a previsão e tentar inserir duplicado.
        const { error } = await supabase
          .from('previsoes')
          .upsert({ user_id: userId, mes: currentMonth, valor_previsto: v }, { onConflict: 'user_id,mes' });
        if (error) throw error;

        await loadData(true);
        setEditingForecast(false);
        addToast('Previsão salva!', 'success');
      } catch (err: any) {
        addToast('Erro ao salvar previsão: ' + err.message, 'error');
      } finally {
        setSavingForecast(false);
      }
    }
  };

  const monthIdx = MONTH_NAMES.findIndex((_, i) => currentMonth === `${currentYear}-${String(i + 1).padStart(2, '0')}`);
  const isEmpty = !loading && !hasAnyEntry;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><Loader size={18} className="animate-spin" /> Carregando dados...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900">
      <header className="bg-slate-900 text-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-5 py-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-semibold leading-tight">Dashboard</h1>
            <p className="text-xs text-slate-400 dark:text-slate-500">{view === 'mensal' ? `${MONTH_NAMES_FULL[monthIdx]} ${currentYear}` : `${currentYear}`}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-800 rounded-lg p-1">
              <button onClick={() => setView('mensal')} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view === 'mensal' ? 'bg-white dark:bg-slate-800 text-slate-900' : 'text-slate-300 hover:text-white'}`}>Mensal</button>
              <button onClick={() => setView('anual')} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view === 'anual' ? 'bg-white dark:bg-slate-800 text-slate-900' : 'text-slate-300 hover:text-white'}`}>Anual</button>
            </div>
            {view === 'mensal' && (
              contas.length === 0 ? (
                <Link href="/contas" className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors">
                  <Plus size={16} strokeWidth={2.5} /> Cadastrar conta
                </Link>
              ) : (
                <button onClick={openNewEntry} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors">
                  <Plus size={16} strokeWidth={2.5} /> Novo
                </button>
              )
            )}
          </div>
        </div>
        {view === 'mensal' && (
          <div className="max-w-6xl mx-auto px-5 pb-4 flex items-center gap-3 overflow-x-auto">
            <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-md hover:bg-slate-800"><ChevronLeft size={16} /></button>
            <div className="flex gap-1">
              {MONTH_NAMES.map((m, i) => {
                const key = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
                return (
                  <button key={key} onClick={() => setCurrentMonth(key)} className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${key === currentMonth ? 'bg-emerald-500 text-slate-900' : 'text-slate-400 dark:text-slate-500 hover:text-white hover:bg-slate-800'}`}>{m}</button>
                );
              })}
            </div>
            <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-md hover:bg-slate-800"><ChevronRight size={16} /></button>
          </div>
        )}
      </header>

      {view === 'mensal' ? (
        <main className="max-w-6xl mx-auto px-5 py-6 space-y-6">
          {contas.length === 0 ? (
            <Link href="/contas" className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 rounded-xl p-4 flex items-start gap-3 hover:bg-emerald-100/60 transition-colors">
              <Wallet size={18} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">Cadastre sua primeira conta bancária</p>
                <p className="text-xs text-emerald-600 mt-0.5">Informe o saldo atual dela para começar a lançar e acompanhar seu saldo real.</p>
              </div>
            </Link>
          ) : isEmpty && (
            <div className="bg-violet-50 dark:bg-violet-500/10 border border-violet-200 rounded-xl p-4 flex items-start gap-3">
              <Inbox size={18} className="text-violet-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-violet-800">Painel zerado e pronto pra começar</p>
                <p className="text-xs text-violet-600 mt-0.5">Lance seus gastos e recebimentos aqui e eles serão salvos automaticamente no banco de dados.</p>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-500/10 text-violet-600 flex items-center justify-center"><Target size={16} /></div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Comprometimento do mês</h2>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Gasto vs. recursos disponíveis (saldo inicial + previsão)</p>
                </div>
              </div>
              {!editingForecast ? (
                <button onClick={() => { setForecastInput(String(forecast[currentMonth] || '')); setEditingForecast(true); }} className="text-xs font-semibold text-violet-600 hover:text-violet-700 border border-violet-200 hover:bg-violet-50 px-3 py-1.5 rounded-lg transition-colors">Previsão</button>
              ) : (
                <div className="flex items-center gap-2">
                  <input type="number" autoFocus value={forecastInput} onChange={(e) => setForecastInput(e.target.value)} className="border border-violet-300 dark:border-violet-700 rounded-lg px-2.5 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white dark:bg-slate-700 dark:text-slate-100" placeholder="0,00" />
                  <button onClick={saveForecast} disabled={savingForecast} className="text-xs font-semibold bg-violet-600 hover:bg-violet-700 disabled:bg-slate-400 text-white px-3 py-1.5 rounded-lg">{savingForecast ? '...' : '✓'}</button>
                  <button onClick={() => setEditingForecast(false)} className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600">✕</button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <MiniStat label="Saldo Inicial" value={commitment.saldoInicial} tone="emerald" />
              <MiniStat label="Previsão" value={commitment.forecastValue} tone="violet" />
              <MiniStat label="Disponível" value={commitment.disponivel} tone="slate" bold />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-500 dark:text-slate-400">Comprometimento</span>
                <span className={`font-bold ${commitment.pct === null ? 'text-slate-400 dark:text-slate-500' : commitment.pct >= 100 ? 'text-rose-600' : commitment.pct >= 80 ? 'text-amber-600' : 'text-emerald-600'}`}>{commitment.pct === null ? '—' : `${commitment.pct}%`}</span>
              </div>
              <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${commitment.pct === null ? 'bg-slate-300' : commitment.pct >= 100 ? 'bg-rose-500' : commitment.pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${commitment.pct === null ? 0 : Math.min(commitment.pct, 100)}%` }} />
              </div>
            </div>

          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="Entradas (mês)" value={totals.entrada} icon={ArrowUpRight} tone="emerald" />
            <SummaryCard label="Saídas (mês)" value={totals.saida} icon={ArrowDownRight} tone="rose" />
            <SummaryCard label="Saldo do mês" value={totals.saldo} icon={Wallet} tone={totals.saldo >= 0 ? 'blue' : 'rose'} />
            <SummaryCard
              label="Saldo projetado"
              value={billTotals.saldoProjetado}
              icon={Calendar}
              tone={billTotals.saldoProjetado >= 0 ? 'violet' : 'rose'}
              tooltip={`É o "disponível" (${currency(commitment.disponivel)}) somado ao que você ainda vai receber (${currency(billTotals.aReceber)}) e descontado do que ainda vai pagar (${currency(billTotals.aPagar)}) — uma prévia de como seu saldo deve ficar depois que essas contas em aberto forem resolvidas.`}
            />
          </div>

          {(billTotals.aPagar > 0 || billTotals.aReceber > 0) && (
            <Link href="/pagar-receber" className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:border-slate-300 transition-colors">
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500">A pagar</p>
                  <p className="text-sm font-bold text-rose-600 tabular-nums">{currency(billTotals.aPagar)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500">A receber</p>
                  <p className="text-sm font-bold text-emerald-600 tabular-nums">{currency(billTotals.aReceber)}</p>
                </div>
              </div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Contas a Pagar/Receber →</span>
            </Link>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-cyan-50 dark:bg-cyan-500/10 flex items-center justify-center shrink-0"><QrCode size={20} className="text-cyan-600" /></div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400">Saídas via Pix</p>
                <p className="text-lg font-bold tabular-nums truncate">{currency(totals.pix)}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{totals.saida > 0 ? Math.round((totals.pix / totals.saida) * 100) : 0}% do total</p>
              </div>
            </div>
            <button onClick={() => setShowCardDetail(true)} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4 text-left hover:border-amber-300 transition-colors">
              <div className="w-11 h-11 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center shrink-0"><CreditCard size={20} className="text-amber-600" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">Saídas via Cartão</p>
                <p className="text-lg font-bold tabular-nums truncate">{currency(totals.cartao)}</p>
                <p className="text-xs text-amber-600 font-medium">Ver categorias →</p>
              </div>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Despesas por categoria</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-4 flex items-center gap-1">
                Onde seu dinheiro está indo
                <span className="group relative inline-flex">
                  <Info size={11} className="text-slate-300 dark:text-slate-600 cursor-help" />
                  <span className="pointer-events-none absolute left-0 bottom-full mb-1.5 w-56 bg-slate-800 text-white text-[11px] leading-snug rounded-lg px-2.5 py-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    O % ao lado de cada categoria compara o gasto deste mês com o do mês anterior — verde quando gastou menos, vermelho quando gastou mais.
                  </span>
                </span>
              </p>
              {categoryData.length > 0 ? (
                <>
                  <div className="py-3">
                    <CategoryRing data={categoryData} size={220} thickness={24} />
                  </div>
                  <div className="space-y-1.5 mt-2 max-h-44 overflow-y-auto pr-1">
                    {categoryData.map((c, i) => {
                      const prevValue = categoryDataPrevMonth?.[c.name];
                      const variacao = prevValue !== undefined && prevValue > 0 ? Math.round(((c.value - prevValue) / prevValue) * 100) : null;
                      return (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                            <span className="text-slate-600 dark:text-slate-300 truncate">{c.name}</span>
                            {limiteExcedido(c.name, c.value) && (
                              <span className="inline-flex items-center text-[10px] font-semibold text-rose-600 bg-rose-50 dark:bg-rose-500/10 px-1.5 py-0.5 rounded shrink-0">Estourou</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {variacao !== null && (
                              <span className={`text-[10px] font-semibold ${variacao > 0 ? 'text-rose-500' : variacao < 0 ? 'text-emerald-500' : 'text-slate-400 dark:text-slate-500'}`}>
                                {variacao > 0 ? '+' : ''}{variacao}%
                              </span>
                            )}
                            <span className="font-semibold tabular-nums">{currency(c.value)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : <p className="text-center text-slate-400 dark:text-slate-500 text-sm py-10">Sem despesas neste mês ainda.</p>}
            </div>

            <div className="lg:col-span-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Categoria × Forma de pagamento</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Pix vs Cartão por categoria</p>
              {paymentBarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={paymentBarData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--chart-grid)" />
                    <XAxis type="number" tickFormatter={(v) => `R$${v}`} fontSize={11} stroke="var(--chart-text)" />
                    <YAxis type="category" dataKey="category" width={140} fontSize={10.5} stroke="var(--chart-text)" />
                    <Tooltip formatter={(v: any) => currency(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="pix" name="Pix" fill="#0891B2" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="cartao" name="Cartão" fill="#D97706" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-slate-400 dark:text-slate-500 text-sm py-10">Sem despesas neste mês ainda.</p>}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mr-auto">Histórico de lançamentos</h2>
              <div className="relative flex-1 min-w-48">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input type="text" placeholder="Buscar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100" />
              </div>
              <FilterSelect value={filterType} onChange={setFilterType} options={[{ v: 'todos', l: 'Todos os tipos' }, { v: 'entrada', l: 'Entradas' }, { v: 'saida', l: 'Saídas' }]} />
              <FilterSelect value={filterPayment} onChange={setFilterPayment} options={[{ v: 'todos', l: 'Todas formas' }, { v: 'pix', l: 'Pix' }, { v: 'cartao', l: 'Cartão' }]} />
              <FilterSelect value={filterCategory} onChange={setFilterCategory} options={[{ v: 'todas', l: 'Todas categorias' }, ...Array.from(new Set(categorias.map(c => c.nome))).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })).map(c => ({ v: c, l: c }))]} />
              <div className="flex items-center gap-1.5">
                <button onClick={() => exportLancamentosCSV(filtered, `extrato-${currentMonth}`)} disabled={filtered.length === 0} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-lg transition-colors">
                  <FileDown size={13} /> CSV
                </button>
                <button onClick={() => exportLancamentosPDF(filtered, `Extrato — ${MONTH_NAMES_FULL[monthIdx]} ${currentYear}`)} disabled={filtered.length === 0} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-lg transition-colors">
                  <FileText size={13} /> PDF
                </button>
              </div>
            </div>
            {selectedIds.size > 0 && (
              <div className="px-5 py-2.5 bg-rose-50 dark:bg-rose-500/10 border-b border-rose-100 flex items-center gap-3">
                <p className="text-xs font-semibold text-rose-700">{selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''}</p>
                <button onClick={() => setBulkDeleteConfirm(true)} className="flex items-center gap-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 px-3 py-1.5 rounded-lg transition-colors">
                  <Trash2 size={13} /> Excluir selecionados
                </button>
                <button onClick={() => setSelectedIds(new Set())} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 ml-auto">Cancelar seleção</button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-5 py-3 font-medium w-8">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-rose-600"
                        checked={paginated.length > 0 && paginated.every(e => selectedIds.has(e.id))}
                        onChange={(ev) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (ev.target.checked) paginated.forEach(e => next.add(e.id));
                            else paginated.forEach(e => next.delete(e.id));
                            return next;
                          });
                        }}
                      />
                    </th>
                    <th className="px-5 py-3 font-medium">Data</th><th className="px-5 py-3 font-medium">Descrição</th><th className="px-5 py-3 font-medium">Categoria</th><th className="px-5 py-3 font-medium">Pagamento</th><th className="px-5 py-3 font-medium text-right">Valor</th><th className="px-5 py-3 font-medium w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400 dark:text-slate-500 text-sm">Nenhum lançamento encontrado.</td></tr>
                  )}
                  {paginated.map((e) => {
                    const meta = catMeta(e.categoria, e.tipo);
                    const catObj = categoriaByName[`${e.tipo}|${e.categoria}`];
                    const CatIcon = catObj ? ICONS[catObj.icone] : null;
                    const PayIcon = e.forma_pagamento === 'pix' ? QrCode : CreditCard;
                    const selected = selectedIds.has(e.id);
                    return (
                      <tr key={e.id} onClick={() => openEditEntry(e)} className={`border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors group cursor-pointer ${selected ? 'bg-rose-50/60 dark:bg-rose-500/10' : ''}`}>
                        <td className="px-5 py-3" onClick={(ev) => ev.stopPropagation()}>
                          <input type="checkbox" className="w-4 h-4 accent-rose-600" checked={selected} onChange={() => toggleSelect(e.id)} />
                        </td>
                        <td className="px-5 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDate(e.data)}</td>
                        <td className="px-5 py-3 font-medium text-slate-700 dark:text-slate-200">
                          <span className="inline-flex items-center gap-1.5">
                            {e.descricao}
                            {e.anexo_path && <Paperclip size={11} className="text-slate-300 dark:text-slate-500 shrink-0" />}
                          </span>
                        </td>
                        <td className="px-5 py-3"><span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md" style={{ color: meta?.color, backgroundColor: `${meta?.color}15` }}>{CatIcon && <CatIcon size={12} />}{e.categoria}</span></td>
                        <td className="px-5 py-3 text-slate-500 dark:text-slate-400"><span className="inline-flex items-center gap-1.5 text-xs"><PayIcon size={13} />{e.forma_pagamento === 'pix' ? 'Pix' : 'Cartão'}</span></td>
                        <td className={`px-5 py-3 text-right font-semibold tabular-nums ${e.tipo === 'entrada' ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-200'}`}>{e.tipo === 'entrada' ? '+' : '-'}{currency(Number(e.valor))}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={(ev) => { ev.stopPropagation(); openEditEntry(e); }} className="text-slate-300 hover:text-violet-600 p-1"><Pencil size={14} /></button>
                            <button onClick={(ev) => { ev.stopPropagation(); setDeleteConfirm({ type: 'lancamento', id: e.id }); }} className="text-slate-300 hover:text-rose-500 p-1"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronLeft size={14} /></button>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{page + 1} / {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronRight size={14} /></button>
                </div>
              </div>
            )}
          </div>
        </main>
      ) : (
        <AnnualView yearData={yearData} yearTotals={yearTotals} yearCategoryData={yearCategoryData} patrimonioEvolucao={patrimonioEvolucao} forecast={forecast} currentYear={currentYear} setCurrentYear={setCurrentYear} onGoToMonth={(k) => { setCurrentMonth(k); setView('mensal'); }} />
      )}
      {showForm && (
        <LancamentoForm
          userId={userId}
          categoriasEntrada={categoriasEntrada}
          categoriasSaida={categoriasSaida}
          contas={contas}
          cartoes={cartoes}
          metas={metas}
          editingEntry={editingEntry}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); refreshEntries(); addToast(editingEntry ? 'Lançamento atualizado!' : 'Lançamento salvo!', 'success'); }}
          onRequestDelete={(id) => { setShowForm(false); setDeleteConfirm({ type: 'lancamento', id }); }}
          onError={(msg) => addToast(msg, 'error')}
        />
      )}


      {showCardDetail && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-2xl p-6 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1"><h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2"><CreditCard size={18} className="text-amber-600" /> Fatura do cartão</h3><button onClick={() => setShowCardDetail(false)}><X size={18} /></button></div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">Total no cartão em {monthIdx >= 0 ? MONTH_NAMES_FULL[monthIdx] : 'mês'}: <span className="font-semibold text-slate-600 dark:text-slate-300">{currency(cardTotal)}</span></p>
            {cardByCategory.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart><Pie data={cardByCategory} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>{cardByCategory.map((entry, i) => <Cell key={i} fill={entry.color} stroke="var(--card-bg)" strokeWidth={2} />)}</Pie><Tooltip formatter={(v: any) => currency(v)} /></PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {cardByCategory.map((c, i) => {
                      const pct = cardTotal > 0 ? Math.round((c.value / cardTotal) * 100) : 0;
                      return (<div key={i}><div className="flex items-center justify-between text-xs mb-1"><span className="text-slate-600 dark:text-slate-300 font-medium">{c.name}</span><span className="font-semibold tabular-nums">{currency(c.value)}</span></div><div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} /></div></div>);
                    })}
                  </div>
                </div>
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Compras no cartão</h4>
                <div className="border border-slate-100 dark:border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-sm"><tbody>
                    {cardEntries.map((e) => { const meta = catMeta(e.categoria, e.tipo); const catObj = categoriaByName[`${e.tipo}|${e.categoria}`]; const CatIcon = catObj ? ICONS[catObj.icone] : null; return (<tr key={e.id} className="border-b border-slate-50 dark:border-slate-800 last:border-0"><td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">{fmtDate(e.data)}</td><td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-200">{e.descricao}</td><td className="px-4 py-2.5"><span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md" style={{ color: meta?.color, backgroundColor: `${meta?.color}15` }}>{CatIcon && <CatIcon size={12} />}{e.categoria}</span></td><td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-700 dark:text-slate-200">{currency(Number(e.valor))}</td></tr>); })}
                  </tbody></table>
                </div>
              </>
            ) : <p className="text-center text-slate-400 dark:text-slate-500 text-sm py-10">Nenhuma compra no cartão neste mês.</p>}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirm !== null}
        title="Confirmar exclusão"
        message="Tem certeza que quer deletar este lançamento?"
        confirmText="Deletar"
        cancelText="Cancelar"
        danger
        onConfirm={() => {
          if (!deleteConfirm) return;
          removeEntry(deleteConfirm.id);
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />

      <ConfirmDialog
        open={bulkDeleteConfirm}
        title="Confirmar exclusão"
        message={`Tem certeza que quer deletar ${selectedIds.size} lançamento${selectedIds.size > 1 ? 's' : ''}? Essa ação não pode ser desfeita.`}
        confirmText={bulkDeleting ? 'Deletando...' : 'Deletar'}
        cancelText="Cancelar"
        danger
        onConfirm={removeSelected}
        onCancel={() => setBulkDeleteConfirm(false)}
      />

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

function AnnualView({ yearData, yearTotals, yearCategoryData, patrimonioEvolucao, forecast, currentYear, setCurrentYear, onGoToMonth }: any) {
  const patrimonioData = MONTH_NAMES.map((label, i) => ({
    label,
    saldo: patrimonioEvolucao.find((p: any) => p.mes === i + 1)?.saldo ?? null,
  }));
  const totalForecast = Object.values(forecast).reduce((s: number, v: any) => s + v, 0);
  return (
    <main className="max-w-6xl mx-auto px-5 py-6 space-y-6">
      <div className="flex items-center justify-center gap-4 mb-4">
        <button onClick={() => setCurrentYear(currentYear - 1)} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"><ChevronLeft size={14} /> {currentYear - 1}</button>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{currentYear}</span>
        <button onClick={() => setCurrentYear(currentYear + 1)} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700">{currentYear + 1} <ChevronRight size={14} /></button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Entradas no ano" value={yearTotals.entrada} icon={ArrowUpRight} tone="emerald" />
        <SummaryCard label="Saídas no ano" value={yearTotals.saida} icon={ArrowDownRight} tone="rose" />
        <SummaryCard label="Saldo do ano" value={yearTotals.saldo} icon={Wallet} tone={yearTotals.saldo >= 0 ? 'blue' : 'rose'} />
        <SummaryCard label="Previsão total" value={totalForecast} icon={Target} tone="violet" />
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Entradas x Saídas por mês</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={yearData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" fontSize={11} stroke="var(--chart-text)" />
            <YAxis tickFormatter={(v: any) => `R$${v}`} fontSize={11} stroke="var(--chart-text)" />
            <Tooltip formatter={(v: any) => currency(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="entrada" name="Entradas" fill="#10B981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="saida" name="Saídas" fill="#F43F5E" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Evolução patrimonial</h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Saldo total acumulado ao fim de cada mês (soma de todas as contas)</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={patrimonioData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" fontSize={11} stroke="var(--chart-text)" />
            <YAxis tickFormatter={(v: any) => `R$${v}`} fontSize={11} stroke="var(--chart-text)" domain={['auto', 'auto']} />
            <Tooltip formatter={(v: any) => (v === null ? '—' : currency(v))} />
            <Line type="monotone" dataKey="saldo" name="Saldo total" stroke="#0EA5E9" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Resultado mensal (entradas − saídas)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={yearData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" fontSize={11} stroke="var(--chart-text)" />
            <YAxis tickFormatter={(v: any) => `R$${v}`} fontSize={11} stroke="var(--chart-text)" />
            <Tooltip formatter={(v: any) => currency(v)} />
            <Line type="monotone" dataKey="saldo" name="Saldo" stroke="#7C3AED" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Despesas por categoria — ano todo</h2>
        {yearCategoryData.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={yearCategoryData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {yearCategoryData.map((entry: any, i: number) => <Cell key={i} fill={entry.color} stroke="var(--card-bg)" strokeWidth={2} />)}
                </Pie>
                <Tooltip formatter={(v: any) => currency(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 self-center">
              {yearCategoryData.map((c: any, i: number) => {
                return (<div key={i} className="flex items-center justify-between text-xs"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} /><span className="text-slate-600 dark:text-slate-300">{c.name}</span></div><span className="font-semibold tabular-nums">{currency(c.value)}</span></div>);
              })}
            </div>
          </div>
        ) : <p className="text-center text-slate-400 dark:text-slate-500 text-sm py-10">Sem dados no ano ainda.</p>}
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800"><h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Resumo mês a mês</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800"><th className="px-5 py-3 font-medium">Mês</th><th className="px-5 py-3 font-medium text-right">Entradas</th><th className="px-5 py-3 font-medium text-right">Saídas</th><th className="px-5 py-3 font-medium text-right">Saldo</th></tr></thead>
            <tbody>
              {yearData.map((m: any) => (
                <tr key={m.key} className="border-b border-slate-50 hover:bg-slate-50/80 cursor-pointer transition-colors" onClick={() => onGoToMonth(m.key)}>
                  <td className="px-5 py-2.5 font-medium text-slate-700 dark:text-slate-200">{m.label}</td>
                  <td className="px-5 py-2.5 text-right text-emerald-600 font-semibold tabular-nums">{currency(m.entrada)}</td>
                  <td className="px-5 py-2.5 text-right text-rose-600 font-semibold tabular-nums">{currency(m.saida)}</td>
                  <td className={`px-5 py-2.5 text-right font-bold tabular-nums ${m.saldo >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>{currency(m.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function MiniStat({ label, value, tone, bold }: any) {
  const tones: any = { violet: 'text-violet-600', emerald: 'text-emerald-600', blue: 'text-blue-600', rose: 'text-rose-600', slate: 'text-slate-800 dark:text-slate-100' };
  return (<div><p className="text-[11px] text-slate-400 dark:text-slate-500 mb-0.5">{label}</p><p className={`text-base tabular-nums ${bold ? 'font-bold' : 'font-semibold'} ${tones[tone]}`}>{currency(value)}</p></div>);
}

function SummaryCard({ label, value, icon: Icon, tone, tooltip }: any) {
  const tones: any = { emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600', rose: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600', blue: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600', violet: 'bg-violet-50 dark:bg-violet-500/10 text-violet-600' };
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${tones[tone]}`}><Icon size={16} /></div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5 flex items-center gap-1">
        {label}
        {tooltip && (
          <span className="group relative inline-flex">
            <Info size={11} className="text-slate-300 dark:text-slate-600 cursor-help" />
            <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-52 bg-slate-800 text-white text-[11px] leading-snug rounded-lg px-2.5 py-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
              {tooltip}
            </span>
          </span>
        )}
      </p>
      <p className="text-xl font-bold tabular-nums text-slate-800 dark:text-slate-100">{currency(value)}</p>
    </div>
  );
}

function FilterSelect({ value, onChange, options }: any) {
  return (<div className="relative"><select value={value} onChange={(e) => onChange(e.target.value)} className="appearance-none bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-8 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-800 cursor-pointer max-w-[160px]">{options.map((o: any) => <option key={o.v} value={o.v}>{o.l}</option>)}</select><ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" /></div>);
}

