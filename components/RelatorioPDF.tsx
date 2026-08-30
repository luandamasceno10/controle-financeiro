import { ICONS } from '@/lib/categorias';

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export interface RelatorioCategoriaItem {
  name: string;
  value: number;
  count: number;
  icone?: string;
}

export interface RelatorioOrcamentoRow {
  categoria: string;
  orcado: number;
  realizado: number;
  icone?: string;
}

export interface RelatorioPDFProps {
  mesLabel: string;
  geradoEm: string;
  entrada: number;
  saida: number;
  saldo: number;
  taxaPoupanca: number;
  custoVidaReal: number;
  fixos: RelatorioCategoriaItem[];
  variaveis: RelatorioCategoriaItem[];
  assinaturasAtivas: { descricao: string; valor: number }[];
  orcamentoRows: RelatorioOrcamentoRow[];
  proximasDespesas: { descricao: string; valor: number; vencimento: string }[];
}

function Icon({ nome, className }: { nome?: string; className?: string }) {
  const C = nome ? ICONS[nome] : null;
  return C ? <C size={13} className={className} /> : null;
}

// Layout pensado pra impressão/PDF — texto denso, pouco espaço em branco,
// nada de interações (hover, tooltip) que não sobrevivem no papel.
export default function RelatorioPDF({
  mesLabel, geradoEm, entrada, saida, saldo, taxaPoupanca, custoVidaReal,
  fixos, variaveis, assinaturasAtivas, orcamentoRows, proximasDespesas,
}: RelatorioPDFProps) {
  const top3 = [...variaveis].sort((a, b) => b.value - a.value).slice(0, 3);
  const totalFixos = fixos.reduce((s, c) => s + c.value, 0);
  const totalVariaveis = variaveis.reduce((s, c) => s + c.value, 0);

  return (
    <div className="text-slate-900 text-[13px] leading-snug" style={{ fontFamily: '-apple-system, Arial, sans-serif' }}>
      <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-5">
        <div>
          <p className="text-[11px] text-slate-500">Controle Financeiro Pessoal</p>
          <h1 className="text-xl font-bold">Relatório de {mesLabel}</h1>
        </div>
        <p className="text-[11px] text-slate-400">Gerado em {geradoEm}</p>
      </div>

      <Secao numero="1" titulo="O raio-X do mês">
        <div className="grid grid-cols-4 gap-3 mb-1">
          <Kpi label="Resultado líquido" value={saldo} destaque={saldo >= 0 ? 'emerald' : 'rose'} />
          <Kpi label="Total recebido" value={entrada} />
          <Kpi label="Total gasto" value={saida} />
          <Kpi label="Taxa de poupança" value={`${taxaPoupanca.toFixed(0)}%`} destaque={taxaPoupanca >= 0 ? undefined : 'rose'} />
        </div>
        <p className="text-[12px] text-slate-500">
          <strong className="text-slate-700">Custo de vida real:</strong> {currency(custoVidaReal)} — o valor mínimo que sua rotina de compromissos fixos exigiu neste mês.
        </p>
      </Secao>

      <Secao numero="2" titulo="Fixos x Variáveis">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[12px] font-semibold text-slate-700 mb-1.5">Fixos / compromissos — {currency(totalFixos)}</p>
            <Lista items={fixos} vazio="Nenhum gasto fixo identificado." />
          </div>
          <div>
            <p className="text-[12px] font-semibold text-slate-700 mb-1.5">Variáveis / estilo de vida — {currency(totalVariaveis)}</p>
            <Lista items={variaveis} vazio="Nenhum gasto variável neste mês." />
          </div>
        </div>
      </Secao>

      <Secao numero="3" titulo='Indicadores "abre olhos"'>
        <p className="text-[12px] font-semibold text-slate-700 mb-1.5">Top 3 vilões (fora dos fixos)</p>
        {top3.length > 0 ? (
          <div className="space-y-1 mb-3">
            {top3.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                <span className="font-bold text-rose-600 w-4">{i + 1}º</span>
                <Icon nome={c.icone} className="text-slate-500" />
                <span className="flex-1">{c.name}</span>
                <span className="text-slate-400">{c.count}x</span>
                <span className="font-semibold w-24 text-right">{currency(c.value)}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-[12px] text-slate-400 mb-3">Sem gastos variáveis neste mês.</p>}

        <p className="text-[12px] font-semibold text-slate-700 mb-1.5">Assinaturas / recorrências ativas no cartão</p>
        {assinaturasAtivas.length > 0 ? (
          <div className="space-y-0.5">
            {assinaturasAtivas.map((a, i) => (
              <div key={i} className="flex items-center justify-between text-[12px]">
                <span>{a.descricao}</span>
                <span className="font-semibold">{currency(a.valor)}</span>
              </div>
            ))}
            <p className="text-[11px] text-slate-400 mt-1">Revise se ainda usa todas — assinatura esquecida é dinheiro parado.</p>
          </div>
        ) : <p className="text-[12px] text-slate-400">Nenhuma assinatura recorrente cadastrada no cartão.</p>}
      </Secao>

      <Secao numero="4" titulo="Orçado x realizado">
        {orcamentoRows.length > 0 ? (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-200">
                <th className="font-medium py-1">Categoria</th>
                <th className="font-medium py-1 text-right">Orçado</th>
                <th className="font-medium py-1 text-right">Realizado</th>
                <th className="font-medium py-1 text-right">Desvio</th>
              </tr>
            </thead>
            <tbody>
              {orcamentoRows.map((o, i) => {
                const pct = o.orcado > 0 ? (o.realizado / o.orcado) * 100 : 0;
                const estourou = pct > 100;
                const alerta = pct >= 90;
                return (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-1 flex items-center gap-1.5"><Icon nome={o.icone} className="text-slate-400" />{o.categoria}</td>
                    <td className="py-1 text-right">{currency(o.orcado)}</td>
                    <td className="py-1 text-right">{currency(o.realizado)}</td>
                    <td className={`py-1 text-right font-semibold ${estourou ? 'text-rose-600' : alerta ? 'text-amber-600' : 'text-emerald-600'}`}>{pct.toFixed(0)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="text-[12px] text-slate-400">Nenhum orçamento definido por categoria ainda.</p>}
      </Secao>

      <Secao numero="5" titulo="Plano de ação" ultima>
        <ul className="space-y-1.5 text-[12px]">
          {orcamentoRows.filter((o) => o.realizado > o.orcado).map((o, i) => (
            <li key={`t${i}`}>🎯 <strong>Teto para {o.categoria}:</strong> mantenha o orçado de {currency(o.orcado)} no próximo mês — este mês passou {currency(o.realizado - o.orcado)} do combinado.</li>
          ))}
          {assinaturasAtivas.length > 0 && (
            <li>✂️ <strong>Corte imediato:</strong> revise as {assinaturasAtivas.length} assinatura{assinaturasAtivas.length > 1 ? 's' : ''} recorrente{assinaturasAtivas.length > 1 ? 's' : ''} listada{assinaturasAtivas.length > 1 ? 's' : ''} acima e cancele o que não usa mais.</li>
          )}
          {proximasDespesas.length > 0 && (
            <li>
              🗓 <strong>Fique de olho nesses vencimentos do próximo mês:</strong>
              <ul className="mt-1 space-y-0.5 ml-5">
                {proximasDespesas.map((d, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="flex-1">{d.descricao} ({fmtDate(d.vencimento)})</span>
                    <span className="font-semibold">{currency(d.valor)}</span>
                  </li>
                ))}
              </ul>
            </li>
          )}
          {orcamentoRows.filter((o) => o.realizado > o.orcado).length === 0 && assinaturasAtivas.length === 0 && proximasDespesas.length === 0 && (
            <li className="text-slate-400">Sem alertas — mês dentro do planejado.</li>
          )}
        </ul>
      </Secao>

      <p className="text-center text-[10px] text-slate-300 mt-6">Relatório gerado automaticamente pelo Controle Financeiro Pessoal</p>
    </div>
  );
}

function Secao({ numero, titulo, children, ultima }: { numero: string; titulo: string; children: React.ReactNode; ultima?: boolean }) {
  return (
    <div className={`mb-4 ${ultima ? '' : 'pb-4 border-b border-slate-100'}`}>
      <h2 className="text-[13px] font-bold text-slate-800 mb-2">{numero}. {titulo}</h2>
      {children}
    </div>
  );
}

function Kpi({ label, value, destaque }: { label: string; value: number | string; destaque?: 'emerald' | 'rose' }) {
  const cor = destaque === 'emerald' ? 'text-emerald-600' : destaque === 'rose' ? 'text-rose-600' : 'text-slate-800';
  return (
    <div className="border border-slate-200 rounded-lg px-2.5 py-2">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className={`text-[14px] font-bold ${cor}`}>{typeof value === 'number' ? currency(value) : value}</p>
    </div>
  );
}

function Lista({ items, vazio }: { items: RelatorioCategoriaItem[]; vazio: string }) {
  if (items.length === 0) return <p className="text-[12px] text-slate-400">{vazio}</p>;
  return (
    <div className="space-y-0.5">
      {items.map((c, i) => (
        <div key={i} className="flex items-center gap-1.5 text-[12px]">
          <Icon nome={c.icone} className="text-slate-400" />
          <span className="flex-1">{c.name}</span>
          <span className="text-slate-400">{c.count}x</span>
          <span className="font-semibold w-20 text-right">{currency(c.value)}</span>
        </div>
      ))}
    </div>
  );
}
