import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { RelatorioMensalData } from './relatorioCalculos';

// Mesma paleta categórica do resto do app (app/globals.css --series-1..8),
// em hex puro porque @react-pdf/renderer não resolve CSS custom properties.
const SERIES_HEX = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const corPorIndice = (i: number) => SERIES_HEX[i % SERIES_HEX.length];

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: 'Helvetica', color: '#1e293b' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 2, borderBottomColor: '#0f172a', paddingBottom: 10, marginBottom: 18 },
  brand: { fontSize: 8, fontWeight: 700, color: '#059669', letterSpacing: 1 },
  title: { fontSize: 17, fontWeight: 700, marginTop: 3 },
  small: { fontSize: 9, color: '#94a3b8' },
  section: { marginBottom: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
  badge: { width: 15, height: 15, borderRadius: 8, color: '#fff', fontSize: 8, textAlign: 'center', paddingTop: 3, marginRight: 7 },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: '#1e293b' },
  kpiRow: { flexDirection: 'row' },
  kpiBox: { flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 6, padding: 8, marginRight: 6 },
  kpiLabel: { fontSize: 8, color: '#94a3b8' },
  kpiValue: { fontSize: 12, fontWeight: 700, marginTop: 3 },
  note: { fontSize: 9, color: '#64748b', marginTop: 8 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 4, marginBottom: 3 },
  th: { fontSize: 8, color: '#94a3b8', fontWeight: 700 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f8fafc', paddingVertical: 4, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 6 },
  cellName: { flex: 3, fontSize: 9, flexDirection: 'row', alignItems: 'center' },
  cellNum: { flex: 1, fontSize: 9, textAlign: 'right' },
  vilaoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  vilaoRank: { width: 16, height: 16, borderRadius: 8, color: '#fff', fontSize: 8, textAlign: 'center', paddingTop: 3, marginRight: 6 },
  planoItem: { borderRadius: 6, padding: 8, marginBottom: 6, fontSize: 9, lineHeight: 1.4 },
});

function Secao({ numero, titulo, cor, children }: { numero: string; titulo: string; cor: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        <Text style={[styles.badge, { backgroundColor: cor }]}>{numero}</Text>
        <Text style={styles.sectionTitle}>{titulo}</Text>
      </View>
      {children}
    </View>
  );
}

function Kpi({ label, value, cor }: { label: string; value: string; cor?: string }) {
  return (
    <View style={styles.kpiBox}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, cor ? { color: cor } : null]}>{value}</Text>
    </View>
  );
}

export function RelatorioPdfDocument({ mesLabel, geradoEm, data }: { mesLabel: string; geradoEm: string; data: RelatorioMensalData }) {
  const { entrada, saida, saldo, taxaPoupanca, custoVidaReal, entradasPorCategoria, variaveis, categoriaPixCartao, orcamentoRows, assinaturasAtivas, proximasDespesas } = data;
  const top3 = [...variaveis].sort((a, b) => b.value - a.value).slice(0, 3);
  const estourados = orcamentoRows.filter((o) => o.realizado > o.orcado);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.brand}>CONTROLE FINANCEIRO PESSOAL</Text>
            <Text style={styles.title}>Relatório de {mesLabel}</Text>
          </View>
          <Text style={styles.small}>Gerado em {geradoEm}</Text>
        </View>

        <Secao numero="1" titulo="O raio-X do mês" cor="#2a78d6">
          <View style={styles.kpiRow}>
            <Kpi label="Resultado líquido" value={`${saldo >= 0 ? '+' : ''}${currency(saldo)}`} cor={saldo >= 0 ? '#059669' : '#e11d48'} />
            <Kpi label="Total recebido" value={currency(entrada)} cor="#059669" />
            <Kpi label="Total gasto" value={currency(saida)} cor="#e11d48" />
            <Kpi label="Taxa de poupança" value={`${taxaPoupanca.toFixed(0)}%`} cor="#7c3aed" />
          </View>
          <Text style={styles.note}>Custo de vida real: {currency(custoVidaReal)} — o valor mínimo que sua rotina de compromissos fixos exigiu neste mês.</Text>
        </Secao>

        <Secao numero="2" titulo="Entradas por categoria" cor="#059669">
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { flex: 3 }]}>Categoria</Text>
            <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Lançamentos</Text>
            <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Total</Text>
          </View>
          {entradasPorCategoria.length > 0 ? entradasPorCategoria.map((c, i) => (
            <View key={i} style={styles.row}>
              <View style={styles.cellName}>
                <View style={[styles.dot, { backgroundColor: corPorIndice(i) }]} />
                <Text>{c.name}</Text>
              </View>
              <Text style={[styles.cellNum, { color: '#94a3b8' }]}>{c.count}x</Text>
              <Text style={[styles.cellNum, { fontWeight: 700, color: '#047857' }]}>{currency(c.value)}</Text>
            </View>
          )) : <Text style={{ fontSize: 9, color: '#94a3b8' }}>Sem entradas neste mês.</Text>}
        </Secao>

        <Secao numero="3" titulo="Gastos por categoria — Pix x Cartão" cor="#1baf7a">
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { flex: 3 }]}>Categoria</Text>
            <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Pix</Text>
            <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Cartão</Text>
            <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Total</Text>
          </View>
          {categoriaPixCartao.map((c, i) => (
            <View key={i} style={styles.row}>
              <View style={styles.cellName}>
                <View style={[styles.dot, { backgroundColor: corPorIndice(i) }]} />
                <Text>{c.name}</Text>
              </View>
              <Text style={[styles.cellNum, { color: c.pix > 0 ? '#0891B2' : '#cbd5e1' }]}>{currency(c.pix)}</Text>
              <Text style={[styles.cellNum, { color: c.cartao > 0 ? '#D97706' : '#cbd5e1' }]}>{currency(c.cartao)}</Text>
              <Text style={[styles.cellNum, { fontWeight: 700 }]}>{currency(c.total)}</Text>
            </View>
          ))}
        </Secao>

        <Secao numero="4" titulo="Indicadores abre olhos" cor="#eb6834">
          <Text style={{ fontSize: 9, fontWeight: 700, marginBottom: 5 }}>Top 3 vilões (fora dos fixos)</Text>
          {top3.map((c, i) => (
            <View key={i} style={styles.vilaoRow}>
              <Text style={[styles.vilaoRank, { backgroundColor: i === 0 ? '#e34948' : i === 1 ? '#eb6834' : '#eda100' }]}>{i + 1}º</Text>
              <Text style={{ flex: 1, fontSize: 9 }}>{c.name}</Text>
              <Text style={{ fontSize: 8, color: '#94a3b8', marginRight: 8 }}>{c.count}x</Text>
              <Text style={{ fontSize: 9, fontWeight: 700 }}>{currency(c.value)}</Text>
            </View>
          ))}
          <Text style={{ fontSize: 9, fontWeight: 700, marginTop: 10, marginBottom: 5 }}>Assinaturas / recorrências ativas no cartão</Text>
          {assinaturasAtivas.length > 0 ? assinaturasAtivas.map((a, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
              <Text style={{ fontSize: 9 }}>{a.descricao}</Text>
              <Text style={{ fontSize: 9, fontWeight: 700 }}>{currency(a.valor)}</Text>
            </View>
          )) : <Text style={{ fontSize: 9, color: '#94a3b8' }}>Nenhuma assinatura recorrente cadastrada no cartão.</Text>}
        </Secao>

        <Secao numero="5" titulo="Orçado x realizado" cor="#4a3aa7">
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { flex: 3 }]}>Categoria</Text>
            <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Orçado</Text>
            <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Realizado</Text>
            <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Desvio</Text>
          </View>
          {orcamentoRows.map((o, i) => {
            const pct = o.orcado > 0 ? (o.realizado / o.orcado) * 100 : 0;
            const cor = pct > 100 ? '#b91c1c' : pct >= 90 ? '#b45309' : '#047857';
            return (
              <View key={i} style={styles.row}>
                <Text style={{ flex: 3, fontSize: 9 }}>{o.categoria}</Text>
                <Text style={styles.cellNum}>{currency(o.orcado)}</Text>
                <Text style={styles.cellNum}>{currency(o.realizado)}</Text>
                <Text style={[styles.cellNum, { color: cor, fontWeight: 700 }]}>{pct.toFixed(0)}%</Text>
              </View>
            );
          })}
        </Secao>

        <Secao numero="6" titulo="Plano de ação" cor="#e34948">
          {estourados.map((o, i) => (
            <View key={`t${i}`} style={[styles.planoItem, { backgroundColor: '#fef2f2' }]}>
              <Text>🎯 Teto para {o.categoria}: mantenha o orçado de {currency(o.orcado)} no próximo mês — este mês passou {currency(o.realizado - o.orcado)} do combinado.</Text>
            </View>
          ))}
          {assinaturasAtivas.length > 0 && (
            <View style={[styles.planoItem, { backgroundColor: '#fffbeb' }]}>
              <Text>✂️ Corte imediato: revise as {assinaturasAtivas.length} assinatura{assinaturasAtivas.length > 1 ? 's' : ''} recorrente{assinaturasAtivas.length > 1 ? 's' : ''} listada{assinaturasAtivas.length > 1 ? 's' : ''} acima e cancele o que não usa mais.</Text>
            </View>
          )}
          {proximasDespesas.length > 0 && (
            <View style={[styles.planoItem, { backgroundColor: '#eff6ff' }]}>
              <Text style={{ marginBottom: 3 }}>🗓 Fique de olho nesses vencimentos do próximo mês:</Text>
              {proximasDespesas.map((d, i) => (
                <Text key={i}>  · {d.descricao} ({fmtDate(d.vencimento)}) — {currency(d.valor)}</Text>
              ))}
            </View>
          )}
          {estourados.length === 0 && assinaturasAtivas.length === 0 && proximasDespesas.length === 0 && (
            <View style={[styles.planoItem, { backgroundColor: '#ecfdf5' }]}>
              <Text style={{ color: '#047857' }}>✅ Sem alertas — mês dentro do planejado.</Text>
            </View>
          )}
        </Secao>

        <Text style={{ textAlign: 'center', fontSize: 8, color: '#cbd5e1', marginTop: 8 }}>Relatório gerado automaticamente pelo Controle Financeiro Pessoal</Text>
      </Page>
    </Document>
  );
}
