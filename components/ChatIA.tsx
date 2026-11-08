'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getContextoIA, montarPromptContexto } from '@/lib/contextIA';

interface Mensagem {
  id: string;
  role: 'user' | 'assistant';
  conteudo: string;
  timestamp: Date;
}

export default function ChatIA({ userId, mesAtual }: { userId: string; mesAtual: string }) {
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [entrada, setEntrada] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [contextoCarregado, setContextoCarregado] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Carregar contexto ao abrir
  useEffect(() => {
    if (aberto && !contextoCarregado) {
      carregarContexto();
    }
  }, [aberto, contextoCarregado]);

  // Scroll automático
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensagens]);

  const carregarContexto = async () => {
    try {
      const contexto = await getContextoIA(userId, mesAtual);
      const msgBoasVindas: Mensagem = {
        id: Date.now().toString(),
        role: 'assistant',
        conteudo: `Olá! 👋 Sou seu assistente financeiro. Estou analisando seus gastos de ${mesAtual}.\n\n📊 **Resumo:** R$ ${contexto.totalEntrada.toFixed(2)} de entrada vs R$ ${contexto.totalSaida.toFixed(2)} de saída.\n\nComo posso ajudar? Você pode me perguntar sobre:\n- Por que gastei tanto em [categoria]?\n- Como está meu orçamento?\n- Devo me preocupar com algo?\n- Recomendações de economia?`,
        timestamp: new Date(),
      };
      setMensagens([msgBoasVindas]);
      setContextoCarregado(true);
    } catch (err) {
      console.error('Erro ao carregar contexto:', err);
    }
  };

  const enviarMensagem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entrada.trim() || carregando) return;

    const msgUsuario: Mensagem = {
      id: Date.now().toString(),
      role: 'user',
      conteudo: entrada,
      timestamp: new Date(),
    };

    setMensagens(prev => [...prev, msgUsuario]);
    setEntrada('');
    setCarregando(true);

    try {
      const contexto = await getContextoIA(userId, mesAtual);
      const promptContexto = montarPromptContexto(contexto);

      // Construir histórico da conversa
      const historicoMensagens = mensagens
        .concat(msgUsuario)
        .map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.conteudo,
        }));

      // Chamar Claude
      const response = await fetch('/api/chat-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensagens: historicoMensagens,
          contexto: promptContexto,
          userId,
        }),
      });

      if (!response.ok) throw new Error('Erro na resposta da IA');

      const { resposta } = await response.json();

      const msgAssistente: Mensagem = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        conteudo: resposta,
        timestamp: new Date(),
      };

      setMensagens(prev => [...prev, msgAssistente]);

      // Salvar conversa no Supabase
      await supabase.from('chat_ia_historico').insert({
        user_id: userId,
        usuario_msg: entrada,
        assistente_msg: resposta,
        mes: mesAtual,
        created_at: new Date(),
      });
    } catch (err) {
      console.error('Erro:', err);
      const msgErro: Mensagem = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        conteudo: 'Desculpa, tive um problema. Tenta de novo? 😅',
        timestamp: new Date(),
      };
      setMensagens(prev => [...prev, msgErro]);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <>
      {/* Botão Flutuante */}
      {!aberto && (
        <button
          onClick={() => setAberto(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-lg flex items-center justify-center transition-transform hover:scale-110"
          title="Chat IA"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {/* Janela de Chat */}
      {aberto && (
        <div className="fixed bottom-6 right-6 z-50 w-96 h-[600px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Assistente Financeiro 🤖</h3>
              <p className="text-xs text-blue-100">Tire suas dúvidas sobre gastos</p>
            </div>
            <button
              onClick={() => setAberto(false)}
              className="hover:bg-blue-700 p-1 rounded transition"
            >
              <X size={20} />
            </button>
          </div>

          {/* Mensagens */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-900"
          >
            {mensagens.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs px-4 py-2 rounded-lg text-sm ${
                    msg.role === 'user'
                      ? 'bg-blue-500 text-white rounded-br-none'
                      : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.conteudo}</p>
                </div>
              </div>
            ))}
            {carregando && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-lg flex items-center gap-2">
                  <Loader size={16} className="animate-spin text-blue-500" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">Pensando...</span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={enviarMensagem} className="border-t border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-800">
            <div className="flex gap-2">
              <input
                type="text"
                value={entrada}
                onChange={e => setEntrada(e.target.value)}
                placeholder="Digite sua pergunta..."
                disabled={carregando}
                className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={carregando || !entrada.trim()}
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-slate-400 text-white p-2 rounded-lg transition"
              >
                <Send size={18} />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
