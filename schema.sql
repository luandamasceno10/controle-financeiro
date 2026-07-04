-- Tabela de Lançamentos
CREATE TABLE lancamentos (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  categoria TEXT NOT NULL,
  forma_pagamento TEXT NOT NULL CHECK (forma_pagamento IN ('pix', 'cartao')),
  valor DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Contas a Pagar
CREATE TABLE contas_pagar (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  categoria TEXT NOT NULL,
  valor DECIMAL(10, 2) NOT NULL,
  vencimento DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago')),
  recorrente BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Contas a Receber
CREATE TABLE contas_receber (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor DECIMAL(10, 2) NOT NULL,
  vencimento DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'recebido')),
  recorrente BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Previsão de Recebimento por Mês
CREATE TABLE previsoes (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes TEXT NOT NULL,
  valor_previsto DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, mes)
);

-- Criar índices para melhor performance
CREATE INDEX lancamentos_user_id ON lancamentos(user_id);
CREATE INDEX lancamentos_data ON lancamentos(data);
CREATE INDEX contas_pagar_user_id ON contas_pagar(user_id);
CREATE INDEX contas_receber_user_id ON contas_receber(user_id);
CREATE INDEX previsoes_user_id ON previsoes(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas_receber ENABLE ROW LEVEL SECURITY;
ALTER TABLE previsoes ENABLE ROW LEVEL SECURITY;

-- Policies de RLS (cada usuário só vê seus próprios dados)
CREATE POLICY "Users can only see their own lancamentos" ON lancamentos
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only see their own contas_pagar" ON contas_pagar
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only see their own contas_receber" ON contas_receber
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only see their own previsoes" ON previsoes
  FOR ALL USING (auth.uid() = user_id);
