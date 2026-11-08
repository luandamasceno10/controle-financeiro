-- Criar tabela para armazenar histórico do chat
CREATE TABLE chat_ia_historico (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usuario_msg TEXT NOT NULL,
  assistente_msg TEXT NOT NULL,
  mes VARCHAR(7) NOT NULL, -- formato YYYY-MM
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Índices para melhor performance
CREATE INDEX idx_chat_ia_user_id ON chat_ia_historico(user_id);
CREATE INDEX idx_chat_ia_mes ON chat_ia_historico(user_id, mes);

-- RLS (Row Level Security)
ALTER TABLE chat_ia_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own chat history" ON chat_ia_historico
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create chat messages" ON chat_ia_historico
  FOR INSERT WITH CHECK (auth.uid() = user_id);
