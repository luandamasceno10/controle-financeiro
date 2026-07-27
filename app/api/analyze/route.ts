import { Anthropic } from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  try {
    const { entries, totals, monthName } = await request.json();

    const prompt = `Você é um consultor financeiro pessoal. Analise os dados financeiros do mês de ${monthName}:

Total de entradas: R$ ${totals.entrada.toFixed(2)}
Total de saídas: R$ ${totals.saida.toFixed(2)}
Saldo do mês: R$ ${totals.saldo.toFixed(2)}

Lançamentos:
${entries.map((e: any) => `- ${e.descricao}: R$ ${e.valor} (${e.categoria}, ${e.tipo})`).join('\n')}

Forneça uma análise curta e prática em português, com:
1. Um padrão identificado nos gastos
2. Um alerta se houver algo preocupante
3. Uma oportunidade de economia
4. Uma nota motivadora final

Seja direto e objetivo, sem rodeios.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
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
