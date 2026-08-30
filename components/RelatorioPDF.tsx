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
  color?: string;
}

export interface RelatorioPixCartaoRow {
  name: string;
  pix: number;
  cartao: number;
  total: number;
  icone?: string;
  color?: string;
}

export interface RelatorioOrcamentoRow {
  categoria: string;
  orcado: number;
  realizado: number;
  icone?: string;
  color?: string;
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
  categoriaPixCartao: RelatorioPixCartaoRow[];
  assinaturasAtivas: { descricao: string; valor: number }[];
  orcamentoRows: RelatorioOrcamentoRow[];
  proximasDespesas: { descricao: string; valor: number; vencimento: string }[];
}

function CategoriaBadge({ icone, color }: { icone?: string; color?: string }) {
  const C = icone ? ICONS[icone] : null;
  return (
    <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: color || '#94A3B8' }}>
      {C ? <C size={11} className="text-white" /> : null}
    </span>
  );
}

// Layout pensado pra impressão/PDF — texto denso, pouco espaço em branco,
// nada de interações (hover, tooltip) que não sobrevivem no papel. As cores
// seguem a mesma paleta categórica do resto do app (lib/categoriaPalette.ts).
export default function RelatorioPDF({
  mesLabel, geradoEm, entrada, saida, saldo, taxaPoupanca, custoVidaReal,
  fixos, variaveis, categoriaPixCartao, assinaturasAtivas, orcamentoRows, proximasDespesas,
}: RelatorioPDFProps) {
  const top3 = [...variaveis].sort((a, b) => b.value - a.value).slice(0, 3);

  return (
    <div className="text-slate-900 text-[13px] leading-snug" style={{ fontFamily: '-apple-system, Arial, sans-serif' }}>
      <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-5">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-emerald-600">CONTROLE FINANCEIRO PESSOAL</p>
          <h1 className="text-xl font-bold">Relatório de {mesLabel}</h1>
        </div>
        <p className="text-[11px] text-slate-400">Gerado em {geradoEm}</p>
      </div>

      <Secao numero="1" titulo="O raio-X do mês" cor="#2a78d6">
        <div className="grid grid-cols-4 gap-3 mb-2">
          <Kpi label="Resultado líquido" value={saldo} destaque={saldo >= 0 ? 'emerald' : 'rose'} />
          <Kpi label="Total recebido" value={entrada} destaque="emerald" suave />
          <Kpi label="Total gasto" value={saida} destaque="rose" suave />
          <Kpi label="Taxa de poupança" value={`${taxaPoupanca.toFixed(0)}%`} destaque={taxaPoupanca >= 0 ? 'violet' : 'rose'} />
        </div>
        <p className="text-[12px] text-slate-500">
          <strong className="text-slate-700">Custo de vida real:</strong> {currency(custoVidaReal)} — o valor mínimo que sua rotina de compromissos fixos exigiu neste mês.
        </p>
      </Secao>

      <Secao numero="2" titulo="Gastos por categoria — Pix x Cartão" cor="#1baf7a">
        {categoriaPixCartao.length > 0 ? (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-200">
                <th className="font-medium py-1">Categoria</th>
                <th className="font-medium py-1 text-right"><span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: '#0891B2' }} />Pix</span></th>
                <th className="font-medium py-1 text-right"><span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: '#D97706' }} />Cartão</span></th>
                <th className="font-medium py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {categoriaPixCartao.map((c, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-1.5 flex items-center gap-1.5"><CategoriaBadge icone={c.icone} color={c.color} />{c.name}</td>
                  <td className="py-1.5 text-right" style={{ color: c.pix > 0 ? '#0891B2' : '#cbd5e1' }}>{currency(c.pix)}</td>
                  <td className="py-1.5 text-right" style={{ color: c.cartao > 0 ? '#D97706' : '#cbd5e1' }}>{currency(c.cartao)}</td>
                  <td className="py-1.5 text-right font-semibold">{currency(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-[12px] text-slate-400">Sem despesas neste mês.</p>}
      </Secao>

      <Secao numero="3" titulo='Indicadores "abre olhos"' cor="#eb6834">
        <p className="text-[12px] font-semibold text-slate-700 mb-1.5">Top 3 vilões (fora dos fixos)</p>
        {top3.length > 0 ? (
          <div className="space-y-1 mb-3">
            {top3.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px] rounded-lg px-2 py-1" style={{ background: i === 0 ? '#fef2f2' : 'transparent' }}>
                <span className="font-bold w-5 text-center rounded-full text-white text-[10px] py-0.5" style={{ background: i === 0 ? '#e34948' : i === 1 ? '#eb6834' : '#eda100' }}>{i + 1}º</span>
                <CategoriaBadge icone={c.icone} color={c.color} />
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
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#D97706' }} />{a.descricao}</span>
                <span className="font-semibold">{currency(a.valor)}</span>
              </div>
            ))}
            <p className="text-[11px] text-slate-400 mt-1">Revise se ainda usa todas — assinatura esquecida é dinheiro parado.</p>
          </div>
        ) : <p className="text-[12px] text-slate-400">Nenhuma assinatura recorrente cadastrada no cartão.</p>}
      </Secao>

      <Secao numero="4" titulo="Orçado x realizado" cor="#4a3aa7">
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
                const cor = estourou ? '#b91c1c' : alerta ? '#b45309' : '#047857';
                const fundo = estourou ? '#fef2f2' : alerta ? '#fffbeb' : '#ecfdf5';
                return (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-1.5 flex items-center gap-1.5"><CategoriaBadge icone={o.icone} color={o.color} />{o.categoria}</td>
                    <td className="py-1.5 text-right">{currency(o.orcado)}</td>
                    <td className="py-1.5 text-right">{currency(o.realizado)}</td>
                    <td className="py-1.5 text-right">
                      <span className="font-semibold px-1.5 py-0.5 rounded" style={{ color: cor, background: fundo }}>{pct.toFixed(0)}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="text-[12px] text-slate-400">Nenhum orçamento definido por categoria ainda.</p>}
      </Secao>

      <Secao numero="5" titulo="Plano de ação" cor="#e34948" ultima>
        <ul className="space-y-1.5 text-[12px]">
          {orcamentoRows.filter((o) => o.realizado > o.orcado).map((o, i) => (
            <li key={`t${i}`} className="rounded-lg bg-rose-50 px-2.5 py-1.5">🎯 <strong>Teto para {o.categoria}:</strong> mantenha o orçado de {currency(o.orcado)} no próximo mês — este mês passou {currency(o.realizado - o.orcado)} do combinado.</li>
          ))}
          {assinaturasAtivas.length > 0 && (
            <li className="rounded-lg bg-amber-50 px-2.5 py-1.5">✂️ <strong>Corte imediato:</strong> revise as {assinaturasAtivas.length} assinatura{assinaturasAtivas.length > 1 ? 's' : ''} recorrente{assinaturasAtivas.length > 1 ? 's' : ''} listada{assinaturasAtivas.length > 1 ? 's' : ''} acima e cancele o que não usa mais.</li>
          )}
          {proximasDespesas.length > 0 && (
            <li className="rounded-lg bg-blue-50 px-2.5 py-1.5">
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
            <li className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-emerald-700">✅ Sem alertas — mês dentro do planejado.</li>
          )}
        </ul>
      </Secao>

      <p className="text-center text-[10px] text-slate-300 mt-6">Relatório gerado automaticamente pelo Controle Financeiro Pessoal</p>
    </div>
  );
}

function Secao({ numero, titulo, children, ultima, cor }: { numero: string; titulo: string; children: React.ReactNode; ultima?: boolean; cor: string }) {
  return (
    <div className={`mb-4 ${ultima ? '' : 'pb-4 border-b border-slate-100'}`}>
      <h2 className="text-[13px] font-bold text-slate-800 mb-2.5 flex items-center gap-2">
        <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] shrink-0" style={{ background: cor }}>{numero}</span>
        {titulo}
      </h2>
      {children}
    </div>
  );
}

function Kpi({ label, value, destaque, suave }: { label: string; value: number | string; destaque?: 'emerald' | 'rose' | 'violet'; suave?: boolean }) {
  const cores: any = {
    emerald: { texto: '#059669', fundo: '#ecfdf5', borda: '#a7f3d0' },
    rose: { texto: '#e11d48', fundo: '#fff1f2', borda: '#fecdd3' },
    violet: { texto: '#7c3aed', fundo: '#f5f3ff', borda: '#ddd6fe' },
  };
  const c = destaque ? cores[destaque] : { texto: '#1e293b', fundo: '#f8fafc', borda: '#e2e8f0' };
  return (
    <div className="rounded-lg px-2.5 py-2 border" style={{ background: suave ? c.fundo : '#fff', borderColor: c.borda }}>
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className="text-[14px] font-bold" style={{ color: c.texto }}>{typeof value === 'number' ? currency(value) : value}</p>
    </div>
  );
}
