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

-- ============================================================
-- Fase 1: menu + categorias editáveis + hora nos lançamentos
-- ============================================================

-- Tabela de Saldos de Abertura (corrige schema drift: já existia em produção,
-- criada direto no Supabase, nunca versionada neste arquivo)
CREATE TABLE IF NOT EXISTS saldos_abertura (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  valor DECIMAL(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, ano)
);
CREATE INDEX IF NOT EXISTS saldos_abertura_user_id ON saldos_abertura(user_id);
ALTER TABLE saldos_abertura ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users can only see their own saldos_abertura" ON saldos_abertura
    FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabela de Categorias (substitui o objeto CATEGORY_META hardcoded no frontend)
CREATE TABLE categorias (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  cor TEXT NOT NULL DEFAULT '#64748B',
  icone TEXT NOT NULL DEFAULT 'CircleEllipsis',
  emoji TEXT,
  ativa BOOLEAN NOT NULL DEFAULT true,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, nome, tipo)
);
CREATE INDEX categorias_user_id ON categorias(user_id);
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own categorias" ON categorias
  FOR ALL USING (auth.uid() = user_id);

-- categoria_id fica nullable e convive com a coluna categoria (texto) existente:
-- histórico financeiro não deve mudar de rótulo quando uma categoria é renomeada
-- depois (snapshot no lançamento), mas o editor precisa de uma FK estável.
ALTER TABLE lancamentos ADD COLUMN categoria_id BIGINT REFERENCES categorias(id) ON DELETE SET NULL;
ALTER TABLE contas_pagar ADD COLUMN categoria_id BIGINT REFERENCES categorias(id) ON DELETE SET NULL;

-- Campo de hora do lançamento (para ordenação cronológica tipo extrato bancário)
ALTER TABLE lancamentos ADD COLUMN hora TIME;
