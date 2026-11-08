import { Anthropic } from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { mensagens, contexto } = await request.json();

    // System prompt com contexto financeiro
    const systemPrompt = `Você é um assistente financeiro inteligente e amigável, especializado em análise de gastos pessoais.

${contexto}

**Regras de Comportamento:**
1. Sempre baseie suas análises nos dados reais fornecidos
2. Seja prático e direto - evite jargão
3. Se algo está fora do padrão, avise o usuário
4. Ofereça sugestões de economia quando apropriado
5. Use emojis com moderação para deixar mais amigável
6. Se não souber algo, diga honestamente
7. Sempre em português brasileiro (informal e acessível)

**Dicas para Análise:**
- Identifique padrões de gasto
- Compare com orçamentos estabelecidos
- Sugira otimizações
- Comemore vitórias financeiras!`;

    // Chamar Claude com histórico
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022', // Modelo mais barato
      max_tokens: 500, // Manter respostas concisas para economizar
      system: systemPrompt,
      messages: mensagens.map((m: any) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const resposta =
      response.content[0].type === 'text'
        ? response.content[0].text
        : 'Desculpa, não consegui processar isso.';

    return Response.json({ resposta });
  } catch (error) {
    console.error('Erro na API de Chat:', error);
    return Response.json(
      { error: 'Erro ao processar mensagem' },
      { status: 500 }
    );
  }
}
