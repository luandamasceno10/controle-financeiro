import { Anthropic } from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getAuthedUserId } from "@/lib/serverAuth";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  const userId = await getAuthedUserId(request);
  if (!userId) {
    return NextResponse.json({ categoria: null }, { status: 401 });
  }

  try {
    const { descricao, categorias } = await request.json();

    if (!descricao || !categorias || categorias.length === 0) {
      return NextResponse.json({ categoria: null });
    }

    const prompt = `Você categoriza lançamentos financeiros. Dada a descrição de um lançamento e uma lista de categorias possíveis, responda APENAS com o nome exato de uma categoria da lista — nada mais, sem pontuação, sem explicação.

Descrição: "${descricao}"

Categorias disponíveis: ${categorias.join(', ')}

Se nenhuma categoria fizer sentido, responda exatamente: nenhuma`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 20,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b: any) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text.trim() : "";

    const match = categorias.find((c: string) => c.toLowerCase() === raw.toLowerCase());

    return NextResponse.json({ categoria: match || null });
  } catch (error: any) {
    console.error("Erro na categorização:", error);
    return NextResponse.json({ categoria: null });
  }
}
