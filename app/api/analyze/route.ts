import { Anthropic } from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getAuthedUserId } from "@/lib/serverAuth";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  const userId = await getAuthedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { resumo } = await request.json();

    const prompt = `Você é um consultor financeiro pessoal experiente. Analise a situação financeira COMPLETA da pessoa a seguir — não é só o mês atual, é o retrato geral: histórico de meses, dívidas, patrimônio, reserva de emergência e metas.

Dados (JSON):
${JSON.stringify(resumo, null, 2)}

Onde:
- serieMensal: entrada/saída/saldo por mês, dos mais antigos aos mais recentes disponíveis.
- custoVidaMedioUltimos3Meses: média de gasto real mensal.
- taxaPoupancaMediaUltimos3MesesPct: quanto % da renda sobrou, em média.
- topCategoriasUltimos3Meses: onde o dinheiro mais vai.
- pctGastoNoCartaoUltimos3Meses: quanto do gasto é no crédito.
- reservaEmergencia: se existe, quanto tem guardado e quantos meses de custo de vida cobre (ideal: 3 a 6).
- dividas: saldo devedor total em aberto e quanto disso é juros estimado.
- patrimonio: saldo em contas bancárias, ativos (investimentos/bens) e total de contas a pagar em aberto.
- metas: progresso de cada meta e se está no ritmo.
- orcamentosEstouradosEsteMes: quantos orçamentos por categoria passaram do limite este mês.

Escreva uma análise financeira completa em português, direta e sem rodeios, organizada EXATAMENTE nestas seções (use os títulos como estão, cada um em uma linha própria, sem markdown/asteriscos):

VISÃO GERAL
Um parágrafo curto resumindo a saúde financeira geral (tendência dos últimos meses subindo, estável ou piorando; se está no vermelho ou no azul).

PONTOS DE ATENÇÃO
Liste de 2 a 4 alertas concretos (dívida cara, reserva insuficiente, categoria de gasto crescendo, orçamento estourado, taxa de poupança caindo) — cada um numa linha começando com "- ".

OPORTUNIDADES DE MELHORIA
Liste de 2 a 4 sugestões PRÁTICAS e específicas (não genéricas tipo "gaste menos") baseadas nos números reais acima — cada uma numa linha começando com "- ".

INSIGHTS
1 ou 2 observações menos óbvias que um olhar de fora percebe nos dados (padrão sazonal, relação entre categorias, comparação entre patrimônio e dívida, etc.).

Se algum dado estiver ausente ou zerado (ex.: sem reserva, sem metas, sem dívidas), comente isso como uma lacuna a resolver, não pule a seção.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b: any) => b.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text : "Não foi possível gerar a análise.";

    return NextResponse.json({ text });
  } catch (error: any) {
    console.error("Erro na análise:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
