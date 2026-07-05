import { Anthropic } from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function analyzeFinances(
  entries: any[],
  totals: any,
  monthName: string
) {
  const entriesText = entries
    .map(
      (e) =>
        `${e.descricao} - R$${e.valor} (${e.categoria}, ${e.forma_pagamento})`
    )
    .join("\n");

  const prompt = `Você é um assistente financeiro especialista. Analise os gastos de uma pessoa durante ${monthName} e forneça insights acionáveis.

GASTOS DO MÊS:
${entriesText}

RESUMO:
- Entradas: R$${totals.entrada.toFixed(2)}
- Saídas: R$${totals.saida.toFixed(2)}
- Saldo: R$${totals.saldo.toFixed(2)}

Por favor, forneça:
1. **Padrão de gastos:** Qual é a principal categoria de gasto?
2. **Alerta:** Há algo preocupante nos gastos?
3. **Oportunidade:** 1 sugestão concreta de economia
4. **Nota:** Uma frase motivadora sobre o desempenho financeiro

Seja direto, prático e sem jargão financeiro complexo. Máximo 150 palavras.`;

  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return message.content[0].type === "text" ? message.content[0].text : "";
}
