'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Lancamento, Categoria, OrcamentoCategoria, Meta, MetaContribuicao, CartaoCredito, Fatura } from '@/lib/supabase';
import CategoriaDonutChart from './CategoriaDonutChart';
import { toDonutSlices } from '@/lib/categoriaPalette';
import { ICONS } from '@/lib/categorias';
import {
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, AlertTriangle,
  PiggyBank, Download, PartyPopper, CreditCard, ArrowUpRight, ArrowDownRight,
  Wallet, FileBarChart,
} from 'lucide-react';

const MESES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function shiftMonth(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

function defaultMes(): string {
  const hoje = new Date();
  return shiftMonth(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`, -1);
}

export default function RelatorioMensal({ userId }: { userId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mes, setMes] = useState(searchParams.get('mes') || defaultMes());
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Lancamento[]>([]);
  const [entriesPrev, setEntriesPrev] = useState<Lancamento[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [orcamentos, setOrcamentos] = useState<OrcamentoCategoria[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [contribuicoes, setContribuicoes] = useState<MetaContribuicao[]>([]);
  const [cartoes, setCartoes] = useState<CartaoCredito[]>([]);
  const [faturas, setFaturas] = useState<Fatura[]>([]);

  useEffect(() => {
    router.replace(`/relatorio?mes=${mes}`, { scroll: false });
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes]);

  const loadData = async () => {
    setLoading(true);
    try {
      const prevMes = shiftMonth(mes, -1);
      const [entriesR, entriesPrevR, catR, orcR, metasR, contribR, cartoesR, faturasR] = await Promise.all([
        supabase.from('lancamentos').select('*').eq('user_id', userId).gte('data', `${mes}-01`).lte('data', `${mes}-31`),
        supabase.from('lancamentos').select('*').eq('user_id', userId).gte('data', `${prevMes}-01`).lte('data', `${prevMes}-31`),
        supabase.from('categorias').select('*').eq('user_id', userId),
        supabase.from('orcamentos_categoria').select('*').eq('user_id', userId),
        supabase.from('metas').select('*').eq('user_id', userId),
        supabase.from('metas_contribuicoes').select('*').eq('user_id', userId),
        supabase.from('cartoes_credito').select('*').eq('user_id', userId),
        supabase.from('faturas').select('*').eq('user_id', userId).eq('competencia', mes),
      ]);
      setEntries((entriesR.data as Lancamento[]) || []);
      setEntriesPrev((entriesPrevR.data as Lancamento[]) || []);
      setCategorias(catR.data || []);
      setOrcamentos(orcR.data || []);
      setMetas(metasR.data || []);
      setContribuicoes(contribR.data || []);
      setCartoes(cartoesR.data || []);
      setFaturas(faturasR.data || []);
    } finally {
      setLoading(false);
    }
  };

  const categoriaByName = useMemo(() => {
    const map: Record<string, Categoria> = {};
    categorias.forEach((c) => { map[`${c.tipo}|${c.nome}`] = c; });
    return map;
  }, [categorias]);

  const categoriaById = useMemo(() => {
    const map: Record<number, Categoria> = {};
    categorias.forEach((c) => { map[c.id] = c; });
    return map;
  }, [categorias]);

  const rollup = (nome: string, tipo: 'entrada' | 'saida' = 'saida'): string => {
    const c = categoriaByName[`${tipo}|${nome}`];
    if (c?.parent_id) return categoriaById[c.parent_id]?.nome || nome;
    return nome;
  };

  const somaTipo = (list: Lancamento[], tipo: 'entrada' | 'saida') =>
    list.filter((e) => e.tipo === tipo && (tipo === 'entrada' || !e.cartao_id)).reduce((s, e) => s + Number(e.valor), 0);

  const entrada = useMemo(() => somaTipo(entries, 'entrada'), [entries]);
  const saida = useMemo(() => somaTipo(entries, 'saida'), [entries]);
  const saldo = entrada - saida;
  const taxaPoupanca = entrada > 0 ? (saldo / entrada) * 100 : 0;

  const entradaPrev = useMemo(() => somaTipo(entriesPrev, 'entrada'), [entriesPrev]);
  const saidaPrev = useMemo(() => somaTipo(entriesPrev, 'saida'), [entriesPrev]);
  const saldoPrev = entradaPrev - saidaPrev;

  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    entries.filter((e) => e.tipo === 'saida' && !e.cartao_id).forEach((e) => {
      const nome = rollup(e.categoria, 'saida');
      map[nome] = (map[nome] || 0) + Number(e.valor);
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value, icone: categoriaByName[`saida|${name}`]?.icone }))
      .sort((a, b) => b.value - a.value);
  }, [entries, categoriaByName, categoriaById]);

  const categoryDataPrev = useMemo(() => {
    const map: Record<string, number> = {};
    entriesPrev.filter((e) => e.tipo === 'saida' && !e.cartao_id).forEach((e) => {
      const nome = rollup(e.categoria, 'saida');
      map[nome] = (map[nome] || 0) + Number(e.valor);
    });
    return map;
  }, [entriesPrev, categoriaByName, categoriaById]);

  const gastoPorCategoriaId = useMemo(() => {
    const map: Record<number, number> = {};
    entries.filter((e) => e.tipo === 'saida' && e.categoria_id && !e.cartao_id).forEach((e) => {
      map[e.categoria_id!] = (map[e.categoria_id!] || 0) + Number(e.valor);
    });
    return map;
  }, [entries]);

  // Um orçamento numa categoria "pai" também soma o gasto das subcategorias.
  const orcamentosEstourados = useMemo(() => {
    return orcamentos
      .map((o) => {
        const filhas = categorias.filter((c) => c.parent_id === o.categoria_id).map((c) => c.id);
        const gasto = [o.categoria_id, ...filhas].reduce((s, id) => s + (gastoPorCategoriaId[id] || 0), 0);
        const cat = categoriaById[o.categoria_id];
        return { categoria: cat?.nome || '—', icone: cat?.icone, gasto, limite: Number(o.valor_limite) };
      })
      .filter((o) => o.gasto > o.limite)
      .sort((a, b) => (b.gasto - b.limite) - (a.gasto - a.limite));
  }, [orcamentos, categorias, categoriaById, gastoPorCategoriaId]);

  // Categorias que mais economizaram vs o mês anterior (maior queda em R$, só quando havia gasto antes).
  const economias = useMemo(() => {
    return categoryData
      .map((c) => {
        const prev = categoryDataPrev[c.name];
        if (prev === undefined || prev <= 0) return null;
        const diff = prev - c.value;
        const pct = Math.round((diff / prev) * 100);
        return { ...c, diff, pct };
      })
      .filter((c): c is NonNullable<typeof c> => !!c && c.diff > 0)
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 3);
  }, [categoryData, categoryDataPrev]);

  const metasDestaque = useMemo(() => {
    return metas
      .map((m) => {
        const contribsAntes = contribuicoes.filter((c) => c.meta_id === m.id && c.data < `${mes}-01`).reduce((s, c) => s + Number(c.valor), 0);
        const contribsNoMes = contribuicoes.filter((c) => c.meta_id === m.id && c.data >= `${mes}-01` && c.data <= `${mes}-31`).reduce((s, c) => s + Number(c.valor), 0);
        const valorAtual = contribsAntes + contribsNoMes;
        const atingiuNoMes = contribsAntes < Number(m.valor_alvo) && valorAtual >= Number(m.valor_alvo);
        return { ...m, contribsNoMes, valorAtual, atingiuNoMes };
      })
      .filter((m) => m.contribsNoMes > 0 || m.atingiuNoMes)
      .sort((a, b) => Number(b.atingiuNoMes) - Number(a.atingiuNoMes) || b.contribsNoMes - a.contribsNoMes);
  }, [metas, contribuicoes, mes]);

  const maioresLancamentos = useMemo(() => {
    return entries
      .filter((e) => e.tipo === 'saida')
      .sort((a, b) => Number(b.valor) - Number(a.valor))
      .slice(0, 6);
  }, [entries]);

  const faturasDoMes = useMemo(() => {
    return faturas.map((f) => {
      const cartao = cartoes.find((c) => c.id === f.cartao_id);
      const total = entries.filter((e) => e.fatura_id === f.id).reduce((s, e) => s + Number(e.valor), 0);
      return { ...f, cartaoNome: cartao?.nome || 'Cartão', total };
    }).filter((f) => f.total > 0);
  }, [faturas, cartoes, entries]);

  const [ano, mesIdx1] = mes.split('-').map(Number);
  const nomeMes = MESES_FULL[mesIdx1 - 1];
  const podeAvancar = mes < defaultMes();

  return (
    <main className="max-w-4xl mx-auto px-5 py-6 space-y-6 print:max-w-full print:px-0">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <FileBarChart size={20} className="text-slate-400 dark:text-slate-500" />
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Relatório mensal</h1>
        </div>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 px-3 py-2 rounded-lg transition-colors">
          <Download size={13} /> Baixar PDF
        </button>
      </div>

      <div className="flex items-center justify-center gap-4 print:hidden">
        <button onClick={() => setMes((m) => shiftMonth(m, -1))} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"><ChevronLeft size={14} /></button>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 w-36 text-center">{nomeMes} {ano}</span>
        <button onClick={() => podeAvancar && setMes((m) => shiftMonth(m, 1))} disabled={!podeAvancar} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight size={14} /></button>
      </div>

      {loading ? (
        <p className="text-center text-slate-400 dark:text-slate-500 text-sm py-16">Carregando relatório...</p>
      ) : entrada === 0 && saida === 0 ? (
        <p className="text-center text-slate-400 dark:text-slate-500 text-sm py-16">Sem movimentação em {nomeMes.toLowerCase()} de {ano}.</p>
      ) : (
        <>
          <div className="hidden print:block mb-2">
            <h1 className="text-xl font-bold text-slate-900">Relatório financeiro — {nomeMes} {ano}</h1>
            <p className="text-xs text-slate-500">Gerado em {new Date().toLocaleDateString('pt-BR')}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Entradas" value={entrada} variacao={pctChange(entrada, entradaPrev)} good="up" icon={ArrowUpRight} tone="emerald" />
            <KpiCard label="Saídas" value={saida} variacao={pctChange(saida, saidaPrev)} good="down" icon={ArrowDownRight} tone="rose" />
            <KpiCard label="Saldo do mês" value={saldo} variacao={pctChange(saldo, saldoPrev)} good="up" icon={Wallet} tone={saldo >= 0 ? 'blue' : 'rose'} />
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 print:border-slate-300">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2 bg-violet-50 dark:bg-violet-500/10 text-violet-600"><PiggyBank size={15} /></div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Taxa de poupança</p>
              <p className={`text-lg font-bold tabular-nums ${taxaPoupanca >= 0 ? 'text-slate-800 dark:text-slate-100' : 'text-rose-600'}`}>{taxaPoupanca.toFixed(0)}%</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">do que entrou, sobrou</p>
            </div>
          </div>

          {orcamentosEstourados.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-rose-200 dark:border-rose-500/30 p-5 print:border-slate-300">
              <h2 className="text-sm font-semibold text-rose-700 dark:text-rose-400 mb-3 flex items-center gap-1.5"><AlertTriangle size={15} /> Orçamentos estourados</h2>
              <div className="space-y-2.5">
                {orcamentosEstourados.map((o, i) => {
                  const Icon = o.icone ? ICONS[o.icone] : null;
                  const pctAcima = Math.round(((o.gasto - o.limite) / o.limite) * 100);
                  return (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      {Icon && <Icon size={14} className="text-rose-500 shrink-0" />}
                      <span className="text-slate-700 dark:text-slate-200 font-medium flex-1 min-w-0 truncate">{o.categoria}</span>
                      <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{currency(o.gasto)} de {currency(o.limite)}</span>
                      <span className="text-xs font-bold text-rose-600 shrink-0">+{pctAcima}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(economias.length > 0 || metasDestaque.length > 0) && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-emerald-200 dark:border-emerald-500/30 p-5 print:border-slate-300">
              <h2 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-1.5"><PartyPopper size={15} /> Destaques de economia</h2>
              <div className="space-y-2.5">
                {economias.map((c, i) => {
                  const Icon = c.icone ? ICONS[c.icone] : null;
                  return (
                    <div key={`e${i}`} className="flex items-center gap-3 text-sm">
                      {Icon && <Icon size={14} className="text-emerald-500 shrink-0" />}
                      <span className="text-slate-700 dark:text-slate-200 font-medium flex-1 min-w-0 truncate">{c.name}</span>
                      <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">gastou {currency(c.diff)} a menos</span>
                      <span className="text-xs font-bold text-emerald-600 shrink-0">-{c.pct}%</span>
                    </div>
                  );
                })}
                {metasDestaque.map((m, i) => (
                  <div key={`m${i}`} className="flex items-center gap-3 text-sm">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: m.cor }} />
                    <span className="text-slate-700 dark:text-slate-200 font-medium flex-1 min-w-0 truncate">{m.nome}</span>
                    {m.atingiuNoMes ? (
                      <span className="text-xs font-bold text-emerald-600 shrink-0">🎉 meta atingida!</span>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">+{currency(m.contribsNoMes)} aportados</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 print:border-slate-300">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Despesas por categoria</h2>
            {categoryData.length > 0 ? (
              <CategoriaDonutChart data={toDonutSlices(categoryData)} totalLabel="Total gasto" height={240} sideBySide />
            ) : <p className="text-center text-slate-400 dark:text-slate-500 text-sm py-6">Sem despesas neste mês.</p>}
          </div>

          {faturasDoMes.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 print:border-slate-300">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-1.5"><CreditCard size={15} /> Faturas do mês</h2>
              <div className="space-y-2">
                {faturasDoMes.map((f) => (
                  <div key={f.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300">{f.cartaoNome}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${f.status === 'paga' ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10' : 'text-amber-700 bg-amber-50 dark:bg-amber-500/10'}`}>{f.status === 'paga' ? 'Paga' : 'Em aberto'}</span>
                      <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{currency(f.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden print:border-slate-300">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800"><h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Maiores lançamentos do mês</h2></div>
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {maioresLancamentos.map((e) => (
                <div key={e.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-700 dark:text-slate-200 font-medium truncate">{e.descricao}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{fmtDate(e.data)} · {e.categoria}</p>
                  </div>
                  <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200 shrink-0 ml-3">{currency(Number(e.valor))}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-[11px] text-slate-300 dark:text-slate-600 print:text-slate-400">Relatório gerado automaticamente pelo Controle Financeiro Pessoal</p>
        </>
      )}
    </main>
  );
}

function KpiCard({ label, value, variacao, good, icon: Icon, tone }: any) {
  const tones: any = { emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600', rose: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600', blue: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600' };
  const melhora = variacao !== null && ((good === 'up' && variacao > 0) || (good === 'down' && variacao < 0));
  const piora = variacao !== null && ((good === 'up' && variacao < 0) || (good === 'down' && variacao > 0));
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 print:border-slate-300">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${tones[tone]}`}><Icon size={15} /></div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">{label}</p>
      <p className="text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100">{currency(value)}</p>
      {variacao !== null && (
        <p className={`text-[10px] font-semibold flex items-center gap-0.5 ${melhora ? 'text-emerald-500' : piora ? 'text-rose-500' : 'text-slate-400 dark:text-slate-500'}`}>
          {variacao > 0 ? <TrendingUp size={10} /> : variacao < 0 ? <TrendingDown size={10} /> : null}
          {variacao > 0 ? '+' : ''}{variacao}% vs mês anterior
        </p>
      )}
    </div>
  );
}
