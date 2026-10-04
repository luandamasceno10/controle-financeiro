'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Categoria, Lancamento } from '@/lib/supabase';
import {
  computeDRE, resolverGrupo, resolverMeta, projetarFechamento, ritmoNecessarioDiario,
  filtrarAteDia, shiftMes, diasNoMes, statusMes, gerarAlertas, GRUPO_LABEL,
  type GrupoDRE, type MetaExecutiva, type ResultadoDRE, type Alerta,
} from '@/lib/executivo';
import { sortCategoriasForSelect, categoriaSelectLabel } from '@/lib/categorias';
import MoneyInput from './MoneyInput';
import { useToast, ToastContainer } from './Toast';
import {
  ResponsiveContainer, Tooltip, Legend, Bar, BarChart, XAxis, YAxis, CartesianGrid,
  LineChart, Line, ReferenceLine,
} from 'recharts';
import {
  ChevronLeft, ChevronRight, Loader, Settings2, X, TrendingUp, TrendingDown, Minus,
  CheckCircle2, AlertTriangle, XCircle, Target, Info, Database,
} from 'lucide-react';

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTH_NAMES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function currencyCompact(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
}

function pct(v: number | null, casas = 1) {
  return v === null ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

// Data local (não UTC): às 22h em Brasília o toISOString já é o dia seguinte.
function hojeLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function labelMes(mes: string, curto = false) {
  const [ano, m] = mes.split('-').map(Number);
  return curto ? `${MONTH_NAMES[m - 1]}/${String(ano).slice(2)}` : `${MONTH_NAMES_FULL[m - 1]} ${ano}`;
}

function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

const TOOLTIP_STYLE = { backgroundColor: 'var(--card-bg)', border: '1px solid var(--chart-grid)', borderRadius: 8, fontSize: 12 };
const CARD = 'bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700';

type LancamentoLeve = Pick<Lancamento, 'id' | 'data' | 'tipo' | 'categoria' | 'valor' | 'cartao_id'>;

export default function PainelExecutivo({ userId }: { userId: string }) {
  const { toasts, addToast, removeToast } = useToast();
  const hoje = hojeLocalISO();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [entries, setEntries] = useState<LancamentoLeve[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [metas, setMetas] = useState<MetaExecutiva[]>([]);
  const [migracaoPendente, setMigracaoPendente] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);

  // 12 meses até o mês exibido: tendência, comparação e média de despesas
  // da projeção saem todos da mesma carga.
  const inicio = `${shiftMes(mes, -11)}-01`;
  const fim = `${mes}-${String(diasNoMes(mes)).padStart(2, '0')}`;

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    const [lancRes, catRes, metasRes] = await Promise.all([
      supabase.from('lancamentos').select('id,data,tipo,categoria,valor,cartao_id').eq('user_id', userId).gte('data', inicio).lte('data', fim),
      supabase.from('categorias').select('*').eq('user_id', userId).eq('ativa', true).order('ordem'),
      supabase.from('metas_executivas').select('*').eq('user_id', userId),
    ]);
    if (lancRes.data) setEntries(lancRes.data as LancamentoLeve[]);
    if (catRes.data) setCategorias(catRes.data);
    if (metasRes.error) {
      setMigracaoPendente(true);
      setMetas([]);
    } else {
      setMigracaoPendente(catRes.data ? catRes.data.length > 0 && !('grupo_dre' in catRes.data[0]) : false);
      setMetas((metasRes.data || []).map((m: any) => ({
        ...m,
        meta_faturamento: m.meta_faturamento === null ? null : Number(m.meta_faturamento),
        meta_lucro: m.meta_lucro === null ? null : Number(m.meta_lucro),
        meta_margem: m.meta_margem === null ? null : Number(m.meta_margem),
      })));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, mes]);

  const status = statusMes(mes, hoje);
  const diaAtual = status === 'corrente' ? Number(hoje.slice(8, 10)) : diasNoMes(mes);

  const calc = useMemo(() => {
    const doMes = (m: string) => entries.filter((e) => e.data.startsWith(m)) as Lancamento[];
    const serie = Array.from({ length: 12 }, (_, i) => {
      const m = shiftMes(mes, i - 11);
      return { mes: m, dre: computeDRE(doMes(m), categorias) };
    });
    const atual = serie[11].dre;
    const mesAnterior = shiftMes(mes, -1);
    // Mês em andamento compara com o mesmo período do mês anterior.
    const anterior = status === 'corrente'
      ? computeDRE(filtrarAteDia(doMes(mesAnterior), diaAtual), categorias)
      : serie[10].dre;
    const projecao = projetarFechamento(atual, mes, hoje, [serie[10], serie[9], serie[8]].map((s) => s.dre));
    const { meta, herdadaDe } = resolverMeta(metas, mes);
    const alertas = gerarAlertas({ atual, anterior, projecao, meta });
    return { serie, atual, anterior, projecao, meta, herdadaDe, alertas, mesAnterior };
  }, [entries, categorias, metas, mes, hoje, status, diaAtual]);

  const { serie, atual, anterior, projecao, meta, herdadaDe, alertas, mesAnterior } = calc;
  const comparativoLabel = status === 'corrente' ? `vs ${MONTH_NAMES[Number(mesAnterior.slice(5)) - 1].toLowerCase()} até dia ${diaAtual}` : `vs ${MONTH_NAMES[Number(mesAnterior.slice(5)) - 1].toLowerCase()}`;
  const semDados = !loading && entries.length === 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900">
      <header className="bg-slate-900 text-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-5 py-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-semibold leading-tight">Painel Executivo</h1>
            <p className="text-xs text-slate-400">Faturamento, lucro, margem e metas do negócio</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-800 rounded-lg">
              <button onClick={() => setMes(shiftMes(mes, -1))} aria-label="Mês anterior" className="p-2 rounded-l-lg hover:bg-slate-700"><ChevronLeft size={16} /></button>
              <span className="px-2 text-sm font-semibold tabular-nums min-w-[120px] text-center">{labelMes(mes)}</span>
              <button onClick={() => setMes(shiftMes(mes, 1))} aria-label="Próximo mês" className="p-2 rounded-r-lg hover:bg-slate-700"><ChevronRight size={16} /></button>
            </div>
            <button onClick={() => setShowConfig(true)} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold text-sm px-3 py-2 rounded-lg transition-colors">
              <Settings2 size={16} /> <span className="hidden sm:inline">Metas & DRE</span>
            </button>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-24 text-slate-600 dark:text-slate-300"><Loader size={18} className="animate-spin" /> Carregando…</div>
      ) : (
        <main className="max-w-6xl mx-auto px-5 py-6 space-y-6">
          {migracaoPendente && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
              <Database size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Falta um passo no banco de dados</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Rode o bloco “Fase 9: Painel Executivo” do <code>schema.sql</code> no SQL Editor do Supabase para salvar metas e a classificação das categorias. Os números abaixo já funcionam com a classificação automática.</p>
              </div>
            </div>
          )}

          <StatusDoMes status={status} diaAtual={diaAtual} totalDias={diasNoMes(mes)} meta={meta} herdadaDe={herdadaDe} onDefinirMeta={() => setShowConfig(true)} />

          {semDados ? (
            <div className={`${CARD} p-10 text-center`}>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sem lançamentos nos últimos 12 meses</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Lance suas vendas como entradas e seus custos e despesas como saídas — o painel monta a DRE sozinho.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiTile
                  label="Faturamento"
                  valor={currency(atual.faturamento)}
                  delta={variacao(atual.faturamento, anterior.faturamento)}
                  deltaLabel={comparativoLabel}
                  progresso={meta?.meta_faturamento ? { realizado: atual.faturamento / meta.meta_faturamento, projetado: status === 'corrente' ? projecao.faturamento / meta.meta_faturamento : null } : null}
                />
                <KpiTile
                  label="Lucro líquido"
                  valor={currency(atual.lucro)}
                  negativo={atual.lucro < 0}
                  delta={variacao(atual.lucro, anterior.lucro)}
                  deltaLabel={comparativoLabel}
                  progresso={meta?.meta_lucro ? { realizado: Math.max(0, atual.lucro) / meta.meta_lucro, projetado: status === 'corrente' ? Math.max(0, projecao.lucro) / meta.meta_lucro : null } : null}
                />
                <KpiTile
                  label="Margem líquida"
                  valor={pct(atual.margemLiquida)}
                  negativo={atual.margemLiquida !== null && atual.margemLiquida < 0}
                  delta={atual.margemLiquida !== null && anterior.margemLiquida !== null ? atual.margemLiquida - anterior.margemLiquida : null}
                  deltaUnidade="p.p."
                  deltaLabel={comparativoLabel}
                  rodape={meta?.meta_margem != null ? `Meta: ${pct(meta.meta_margem)}${status === 'corrente' ? ` · projeção ${pct(projecao.margem)}` : ''}` : `Margem bruta: ${pct(atual.margemBruta)}`}
                />
                <KpiTile
                  label="Ponto de equilíbrio"
                  dica="Faturamento mínimo no mês para não ter prejuízo, mantendo a margem bruta atual e as despesas operacionais do mês."
                  valor={atual.pontoEquilibrio === null ? '—' : currency(atual.pontoEquilibrio)}
                  rodape={atual.pontoEquilibrio === null
                    ? 'Sem margem bruta positiva'
                    : atual.faturamento >= atual.pontoEquilibrio
                      ? `Folga de ${currency(atual.faturamento - atual.pontoEquilibrio)}`
                      : `Faltam ${currency(atual.pontoEquilibrio - atual.faturamento)}`}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className={`lg:col-span-2 ${CARD} p-5`}>
                  <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Metas do mês</h2>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">{status === 'corrente' ? 'Realizado até hoje e projeção de fechamento no ritmo atual' : status === 'passado' ? 'Resultado final do mês' : 'Mês ainda não começou'}</p>
                  {meta ? (
                    <div className="space-y-5">
                      {meta.meta_faturamento ? (
                        <MetaRow
                          label="Faturamento"
                          realizado={atual.faturamento}
                          projetado={status === 'corrente' ? projecao.faturamento : null}
                          alvo={meta.meta_faturamento}
                          formato={currency}
                          extra={status === 'corrente' && atual.faturamento < meta.meta_faturamento
                            ? `Precisa de ${currency(ritmoNecessarioDiario(meta.meta_faturamento, atual.faturamento, projecao.diasRestantes))}/dia até o fim do mês`
                            : undefined}
                        />
                      ) : null}
                      {meta.meta_lucro ? (
                        <MetaRow label="Lucro líquido" realizado={atual.lucro} projetado={status === 'corrente' ? projecao.lucro : null} alvo={meta.meta_lucro} formato={currency} />
                      ) : null}
                      {meta.meta_margem != null ? (
                        <MetaRow label="Margem líquida" realizado={atual.margemLiquida ?? 0} projetado={status === 'corrente' ? projecao.margem : null} alvo={meta.meta_margem} formato={(v) => pct(v)} />
                      ) : null}
                    </div>
                  ) : (
                    <button onClick={() => setShowConfig(true)} className="w-full border border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-5 text-sm text-slate-500 dark:text-slate-400 hover:border-emerald-400 hover:text-emerald-600 transition-colors flex items-center justify-center gap-2">
                      <Target size={16} /> Definir metas de faturamento, lucro e margem
                    </button>
                  )}
                </div>

                <div className={`lg:col-span-3 ${CARD} p-5`}>
                  <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Leitura do mês</h2>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">O que os números estão dizendo — do mais urgente para o menos</p>
                  {alertas.length > 0 ? (
                    <ul className="space-y-3">{alertas.map((a, i) => <AlertaItem key={i} alerta={a} />)}</ul>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Nada fora do normal neste período.{!meta && ' Defina metas para o painel acompanhar o ritmo.'}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className={`lg:col-span-3 ${CARD} p-5`}>
                  <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">DRE simplificada</h2>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Cada barra é proporcional ao faturamento do mês</p>
                  <DRE dre={atual} />
                </div>
                <div className={`lg:col-span-2 ${CARD} p-5`}>
                  <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Para onde vai o faturamento</h2>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Maiores custos e despesas, em % do faturamento</p>
                  <MaioresGastos dre={atual} />
                </div>
              </div>

              <TendenciaCharts serie={serie} metaMargem={meta?.meta_margem ?? null} parcial={status === 'corrente' ? mes : null} />

              <div className={`${CARD} overflow-hidden`}>
                <div className="p-5 border-b border-slate-100 dark:border-slate-700"><h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Últimos 12 meses</h2></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-700">
                        <th className="px-5 py-3 font-medium">Mês</th>
                        <th className="px-5 py-3 font-medium text-right">Faturamento</th>
                        <th className="px-5 py-3 font-medium text-right">Lucro bruto</th>
                        <th className="px-5 py-3 font-medium text-right">Lucro líquido</th>
                        <th className="px-5 py-3 font-medium text-right">Margem</th>
                        <th className="px-5 py-3 font-medium text-right">vs meta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...serie].reverse().map(({ mes: m, dre }) => {
                        const metaMes = resolverMeta(metas, m).meta;
                        const vsMeta = metaMes?.meta_faturamento ? (dre.faturamento / metaMes.meta_faturamento) * 100 : null;
                        return (
                          <tr key={m} onClick={() => setMes(m)} className={`border-b border-slate-50 dark:border-slate-700/50 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40 ${m === mes ? 'bg-emerald-50/60 dark:bg-emerald-500/10' : ''}`}>
                            <td className="px-5 py-2.5 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">{labelMes(m, true)}{m === mes && status === 'corrente' ? '*' : ''}</td>
                            <td className="px-5 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{currency(dre.faturamento)}</td>
                            <td className="px-5 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400">{currency(dre.lucroBruto)}</td>
                            <td className={`px-5 py-2.5 text-right tabular-nums font-semibold ${dre.lucro < 0 ? 'text-rose-600' : 'text-slate-800 dark:text-slate-100'}`}>{currency(dre.lucro)}</td>
                            <td className="px-5 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{pct(dre.margemLiquida)}</td>
                            <td className="px-5 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{vsMeta === null ? '—' : `${Math.round(vsMeta)}%`}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>
      )}

      {showConfig && (
        <ConfigModal
          userId={userId}
          mes={mes}
          metas={metas}
          categorias={categorias}
          migracaoPendente={migracaoPendente}
          onClose={() => setShowConfig(false)}
          onSaved={(msg) => { addToast(msg, 'success'); loadData(true); }}
          onError={(msg) => addToast(msg, 'error')}
        />
      )}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

// ------------------------------------------------------------

function StatusDoMes({ status, diaAtual, totalDias, meta, herdadaDe, onDefinirMeta }: {
  status: 'passado' | 'corrente' | 'futuro'; diaAtual: number; totalDias: number;
  meta: MetaExecutiva | null; herdadaDe: string | null; onDefinirMeta: () => void;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap text-xs">
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold ${status === 'corrente' ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'bg-slate-200/70 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
        {status === 'corrente' ? `Em andamento · dia ${diaAtual} de ${totalDias}` : status === 'passado' ? 'Mês fechado' : 'Mês futuro'}
      </span>
      {status === 'corrente' && (
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <div className="w-24 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${(diaAtual / totalDias) * 100}%` }} /></div>
          {Math.round((diaAtual / totalDias) * 100)}% do mês
        </div>
      )}
      {herdadaDe && <span className="text-slate-400 dark:text-slate-500">Metas herdadas de {labelMes(herdadaDe)} · <button onClick={onDefinirMeta} className="underline hover:text-emerald-600">ajustar para este mês</button></span>}
      {!meta && <span className="text-slate-400 dark:text-slate-500">Sem metas definidas</span>}
    </div>
  );
}

function KpiTile({ label, valor, negativo, delta, deltaUnidade = '%', deltaLabel, progresso, rodape, dica }: {
  label: string; valor: string; negativo?: boolean;
  delta?: number | null; deltaUnidade?: '%' | 'p.p.'; deltaLabel?: string;
  progresso?: { realizado: number; projetado: number | null } | null;
  rodape?: string; dica?: string;
}) {
  const DeltaIcon = delta == null || Math.abs(delta) < 0.05 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const deltaCor = delta == null || Math.abs(delta) < 0.05 ? 'text-slate-500 dark:text-slate-400' : delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
  return (
    <div className={`${CARD} p-4 flex flex-col`}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
        {label}
        {dica && (
          <span className="group relative inline-flex">
            <Info size={11} className="text-slate-300 dark:text-slate-600 cursor-help" />
            <span className="pointer-events-none absolute right-0 bottom-full mb-1.5 w-56 bg-slate-800 text-white text-[11px] leading-snug rounded-lg px-2.5 py-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">{dica}</span>
          </span>
        )}
      </p>
      <p className={`text-xl sm:text-2xl font-bold tabular-nums mt-1 break-words ${negativo ? 'text-rose-600' : 'text-slate-900 dark:text-slate-50'}`}>{valor}</p>
      {delta !== undefined && (
        <p className={`text-xs mt-1 flex items-center gap-1 ${deltaCor}`}>
          <DeltaIcon size={13} />
          <span className="font-semibold tabular-nums whitespace-nowrap">{delta == null ? 's/ base' : `${delta > 0 ? '+' : ''}${delta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${deltaUnidade === '%' ? '%' : ' p.p.'}`}</span>
          <span className="text-slate-400 dark:text-slate-500 truncate">{deltaLabel}</span>
        </p>
      )}
      {progresso && (
        <div className="mt-auto pt-3">
          <BarraMeta realizado={progresso.realizado} projetado={progresso.projetado} />
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {Math.round(progresso.realizado * 100)}% da meta{progresso.projetado !== null && ` · projeção ${Math.round(progresso.projetado * 100)}%`}
          </p>
        </div>
      )}
      {rodape && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-auto pt-3">{rodape}</p>}
    </div>
  );
}

// Barra de progresso: preenchido = realizado; traço = onde o mês fecha no
// ritmo atual. Cor do traço indica se a projeção alcança a meta.
function BarraMeta({ realizado, projetado }: { realizado: number; projetado: number | null }) {
  const w = Math.max(0, Math.min(1, realizado)) * 100;
  const p = projetado === null ? null : Math.max(0, Math.min(1, projetado)) * 100;
  return (
    <div className="relative h-2 rounded-full bg-slate-100 dark:bg-slate-700">
      <div className={`absolute inset-y-0 left-0 rounded-full ${realizado >= 1 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${w}%` }} />
      {p !== null && p > w && (
        <div className={`absolute -top-1 -bottom-1 w-0.5 rounded ${projetado! >= 1 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ left: `calc(${p}% - 1px)` }} title="Projeção de fechamento" />
      )}
    </div>
  );
}

function MetaRow({ label, realizado, projetado, alvo, formato, extra }: {
  label: string; realizado: number; projetado: number | null; alvo: number;
  formato: (v: number) => string; extra?: string;
}) {
  const ref = projetado ?? realizado;
  const situacao = realizado >= alvo ? 'batida' : ref >= alvo ? 'no-ritmo' : ref >= alvo * 0.85 ? 'atencao' : 'risco';
  const chip = {
    'batida': { txt: 'Batida', Icon: CheckCircle2, cls: 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/10' },
    'no-ritmo': { txt: 'No ritmo', Icon: CheckCircle2, cls: 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/10' },
    'atencao': { txt: projetado === null ? 'Ficou perto' : 'Atenção', Icon: AlertTriangle, cls: 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/10' },
    'risco': { txt: projetado === null ? 'Não bateu' : 'Em risco', Icon: XCircle, cls: 'text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-500/10' },
  }[situacao];
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${chip.cls}`}><chip.Icon size={12} /> {chip.txt}</span>
      </div>
      <BarraMeta realizado={alvo > 0 ? realizado / alvo : 0} projetado={projetado === null || alvo <= 0 ? null : projetado / alvo} />
      <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums gap-2">
        <span>{formato(realizado)}{projetado !== null && ` → ${formato(projetado)}`}</span>
        <span>meta {formato(alvo)}</span>
      </div>
      {extra && <p className={`text-[11px] mt-1 ${ref >= alvo ? 'text-slate-500 dark:text-slate-400' : 'text-amber-700 dark:text-amber-400'}`}>{extra}</p>}
    </div>
  );
}

function AlertaItem({ alerta }: { alerta: Alerta }) {
  const cfg = {
    critico: { Icon: XCircle, cls: 'text-rose-600 dark:text-rose-400' },
    atencao: { Icon: AlertTriangle, cls: 'text-amber-600 dark:text-amber-400' },
    bom: { Icon: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400' },
  }[alerta.nivel];
  return (
    <li className="flex items-start gap-3">
      <cfg.Icon size={18} className={`${cfg.cls} shrink-0 mt-0.5`} aria-label={alerta.nivel} />
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{alerta.titulo}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{alerta.detalhe}</p>
      </div>
    </li>
  );
}

function DRE({ dre }: { dre: ResultadoDRE }) {
  const base = dre.faturamento || Math.max(dre.custos + dre.despesas, 1);
  const linhas: { label: string; valor: number; sinal?: '−' | '='; destaque?: boolean; margem?: number | null; cor: string }[] = [
    { label: 'Faturamento', valor: dre.faturamento, cor: 'var(--series-1)' },
    { label: 'Custos diretos', valor: dre.custos, sinal: '−', cor: 'var(--chart-text)' },
    { label: 'Lucro bruto', valor: dre.lucroBruto, sinal: '=', destaque: true, margem: dre.margemBruta, cor: 'var(--series-3)' },
    { label: 'Despesas operacionais', valor: dre.despesas, sinal: '−', cor: 'var(--chart-text)' },
    { label: 'Lucro líquido', valor: dre.lucro, sinal: '=', destaque: true, margem: dre.margemLiquida, cor: 'var(--series-3)' },
  ];
  return (
    <div className="space-y-3">
      {linhas.map((l) => (
        <div key={l.label} className={l.destaque ? 'pt-3 border-t border-slate-100 dark:border-slate-700' : ''}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className={`text-sm ${l.destaque ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}>
              {l.sinal && <span className="inline-block w-4 text-slate-400">{l.sinal}</span>}{l.label}
            </span>
            <span className="text-sm tabular-nums whitespace-nowrap">
              <span className={`font-semibold ${l.valor < 0 ? 'text-rose-600' : 'text-slate-800 dark:text-slate-100'}`}>{currency(l.sinal === '−' ? -l.valor : l.valor)}</span>
              {l.margem !== undefined && <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">{pct(l.margem)}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, (Math.abs(l.valor) / base) * 100))}%`, background: l.valor < 0 ? '#e11d48' : l.cor, opacity: l.sinal === '−' ? 0.55 : 1 }} />
          </div>
        </div>
      ))}
      {dre.ticketMedio !== null && (
        <p className="text-xs text-slate-500 dark:text-slate-400 pt-2">{dre.numVendas} {dre.numVendas === 1 ? 'entrada de receita' : 'entradas de receita'} · ticket médio {currency(dre.ticketMedio)}</p>
      )}
    </div>
  );
}

function MaioresGastos({ dre }: { dre: ResultadoDRE }) {
  const itens = [
    ...dre.custosPorCategoria.map((c) => ({ ...c, grupo: 'Custo' as const })),
    ...dre.despesasPorCategoria.map((c) => ({ ...c, grupo: 'Despesa' as const })),
  ].sort((a, b) => b.valor - a.valor).slice(0, 7);
  if (itens.length === 0) return <p className="text-sm text-slate-500 dark:text-slate-400">Sem custos ou despesas no período.</p>;
  const max = itens[0].valor;
  return (
    <ul className="space-y-3">
      {itens.map((i) => (
        <li key={`${i.grupo}-${i.nome}`}>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{i.nome} <span className="text-[10px] uppercase tracking-wide text-slate-400">{i.grupo}</span></span>
            <span className="text-sm tabular-nums whitespace-nowrap text-slate-800 dark:text-slate-100 font-semibold">
              {currency(i.valor)}
              {dre.faturamento > 0 && <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1.5">{pct((i.valor / dre.faturamento) * 100)}</span>}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(i.valor / max) * 100}%`, background: i.grupo === 'Custo' ? 'var(--series-2)' : 'var(--series-7)' }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// O mês em andamento entra marcado com * — sem isso, todo início de mês
// parece um tombo de faturamento e de margem no gráfico.
function TendenciaCharts({ serie, metaMargem, parcial }: { serie: { mes: string; dre: ResultadoDRE }[]; metaMargem: number | null; parcial: string | null }) {
  const data = serie.map(({ mes, dre }) => ({
    label: labelMes(mes, true) + (mes === parcial ? '*' : ''),
    faturamento: dre.faturamento,
    lucro: dre.lucro,
    margem: dre.margemLiquida === null ? null : Number(dre.margemLiquida.toFixed(1)),
  }));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className={`lg:col-span-3 ${CARD} p-5`}>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Faturamento e lucro — 12 meses</h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">A distância entre as barras é o quanto custa operar{parcial && ' · * mês em andamento'}</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" fontSize={11} stroke="var(--chart-text)" tickLine={false} />
            <YAxis tickFormatter={(v: number) => currencyCompact(v)} fontSize={11} stroke="var(--chart-text)" width={70} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v: any) => currency(Number(v))} contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke="var(--chart-text)" />
            <Bar dataKey="faturamento" name="Faturamento" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="lucro" name="Lucro líquido" fill="var(--series-3)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className={`lg:col-span-2 ${CARD} p-5`}>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Margem líquida — 12 meses</h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">{metaMargem != null ? `Linha tracejada: meta de ${pct(metaMargem)}` : 'Quanto sobra de cada R$ 100 faturados'}{parcial && ' · * parcial'}</p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" fontSize={11} stroke="var(--chart-text)" tickLine={false} interval="preserveStartEnd" />
            <YAxis tickFormatter={(v: number) => `${v}%`} fontSize={11} stroke="var(--chart-text)" width={44} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v: any) => (v === null ? '—' : `${String(v).replace('.', ',')}%`)} contentStyle={TOOLTIP_STYLE} />
            {metaMargem != null && <ReferenceLine y={metaMargem} stroke="var(--chart-text)" strokeDasharray="4 4" />}
            <ReferenceLine y={0} stroke="var(--chart-grid)" />
            <Line type="monotone" dataKey="margem" name="Margem líquida" stroke="var(--series-7)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: 'var(--card-bg)' }} activeDot={{ r: 6 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ------------------------------------------------------------

function ConfigModal({ userId, mes, metas, categorias, migracaoPendente, onClose, onSaved, onError }: {
  userId: string; mes: string; metas: MetaExecutiva[]; categorias: Categoria[]; migracaoPendente: boolean;
  onClose: () => void; onSaved: (msg: string) => void; onError: (msg: string) => void;
}) {
  const [aba, setAba] = useState<'metas' | 'dre'>('metas');
  const { meta } = resolverMeta(metas, mes);
  const [fat, setFat] = useState(meta?.meta_faturamento != null ? String(meta.meta_faturamento) : '');
  const [lucro, setLucro] = useState(meta?.meta_lucro != null ? String(meta.meta_lucro) : '');
  const [margem, setMargem] = useState(meta?.meta_margem != null ? String(meta.meta_margem) : '');
  const [saving, setSaving] = useState(false);
  const [grupos, setGrupos] = useState<Record<number, GrupoDRE | null>>(() => Object.fromEntries(categorias.map((c) => [c.id, c.grupo_dre ?? null])));

  // Sugere a margem implícita quando faturamento e lucro estão preenchidos.
  const margemImplicita = Number(fat) > 0 && lucro !== '' ? (Number(lucro) / Number(fat)) * 100 : null;

  const salvarMetas = async () => {
    setSaving(true);
    const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
    const { error } = await supabase.from('metas_executivas').upsert(
      { user_id: userId, mes, meta_faturamento: num(fat), meta_lucro: num(lucro), meta_margem: num(margem) },
      { onConflict: 'user_id,mes' },
    );
    setSaving(false);
    if (error) { onError('Erro ao salvar metas: ' + error.message); return; }
    onSaved(`Metas salvas a partir de ${labelMes(mes)}`);
    onClose();
  };

  const salvarGrupo = async (cat: Categoria, grupo: GrupoDRE | null) => {
    const anterior = grupos[cat.id];
    setGrupos((g) => ({ ...g, [cat.id]: grupo }));
    const { error } = await supabase.from('categorias').update({ grupo_dre: grupo }).eq('id', cat.id).eq('user_id', userId);
    if (error) {
      setGrupos((g) => ({ ...g, [cat.id]: anterior }));
      onError('Erro ao salvar classificação: ' + error.message);
      return;
    }
    onSaved(`${cat.nome}: ${grupo ? GRUPO_LABEL[grupo] : 'automático'}`);
  };

  const ordenadas = sortCategoriasForSelect(categorias.filter((c) => c.nome !== 'Cartão de crédito'));
  const inputCls = 'w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Metas & classificação da DRE</h2>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><X size={18} /></button>
        </div>
        <div className="px-5">
          <div className="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1">
            {(['metas', 'dre'] as const).map((a) => (
              <button key={a} onClick={() => setAba(a)} className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${aba === a ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
                {a === 'metas' ? `Metas de ${labelMes(mes)}` : 'Classificar categorias'}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          {migracaoPendente && (
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg p-3 mb-4">Rode o bloco “Fase 9: Painel Executivo” do <code>schema.sql</code> no Supabase antes de salvar.</p>
          )}
          {aba === 'metas' ? (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Vale para {labelMes(mes)} e para os meses seguintes, até você definir outra. Deixe em branco o que não quiser acompanhar.</p>
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Meta de faturamento (R$)</span>
                <MoneyInput value={fat} onChange={setFat} className={`${inputCls} mt-1`} placeholder="Ex.: 120000" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Meta de lucro líquido (R$)</span>
                <MoneyInput value={lucro} onChange={setLucro} className={`${inputCls} mt-1`} placeholder="Ex.: 18000" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Meta de margem líquida (%)</span>
                <MoneyInput value={margem} onChange={setMargem} className={`${inputCls} mt-1`} placeholder="Ex.: 15" />
                {margemImplicita !== null && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
                    As metas de faturamento e lucro implicam {pct(margemImplicita)} de margem.{' '}
                    {margem === '' && <button type="button" onClick={() => setMargem(margemImplicita.toFixed(1))} className="underline hover:text-emerald-600">Usar esse valor</button>}
                  </span>
                )}
              </label>
              <button onClick={salvarMetas} disabled={saving || migracaoPendente} className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors">
                {saving ? 'Salvando…' : 'Salvar metas'}
              </button>
            </div>
          ) : (
            <div>
              <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1 mb-4">
                <li><b className="text-slate-700 dark:text-slate-200">Custo direto:</b> só existe se houver venda — mercadoria, peças, impostos sobre venda, taxa de maquininha, comissão.</li>
                <li><b className="text-slate-700 dark:text-slate-200">Despesa operacional:</b> existe vendendo ou não — aluguel, folha, marketing, sistemas, contador.</li>
                <li><b className="text-slate-700 dark:text-slate-200">Fora do resultado:</b> dinheiro que só muda de lugar — aporte, investimento, transferência, retirada de lucro.</li>
              </ul>
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {ordenadas.map((c) => {
                  const auto = c.parent_id
                    ? resolverGrupo(c.nome, c.tipo, categorias.map((x) => (x.id === c.id ? { ...x, grupo_dre: null } : { ...x, grupo_dre: grupos[x.id] ?? null })))
                    : resolverGrupo(c.nome, c.tipo, [{ ...c, grupo_dre: null }]);
                  const opcoes: GrupoDRE[] = c.tipo === 'entrada' ? ['receita', 'fora'] : ['custo', 'despesa', 'fora'];
                  return (
                    <div key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{categoriaSelectLabel(c, categorias)}</p>
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">{c.tipo === 'entrada' ? 'Entrada' : 'Saída'}</p>
                      </div>
                      <select
                        value={grupos[c.id] ?? ''}
                        disabled={migracaoPendente}
                        onChange={(e) => salvarGrupo(c, (e.target.value || null) as GrupoDRE | null)}
                        className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 max-w-[190px]"
                      >
                        <option value="">Automático ({GRUPO_LABEL[auto].split(' (')[0].toLowerCase()})</option>
                        {opcoes.map((g) => <option key={g} value={g}>{GRUPO_LABEL[g]}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
