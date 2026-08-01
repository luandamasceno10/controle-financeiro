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

-- ============================================================
-- Fase 2: contas bancárias (saldo por conta) + análise de IA limitada
-- ============================================================

CREATE TABLE contas_bancarias (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  banco TEXT,
  saldo_inicial DECIMAL(12, 2) NOT NULL DEFAULT 0,
  cor TEXT NOT NULL DEFAULT '#0F172A',
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX contas_bancarias_user_id ON contas_bancarias(user_id);
ALTER TABLE contas_bancarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own contas_bancarias" ON contas_bancarias
  FOR ALL USING (auth.uid() = user_id);

-- Cada lançamento passa a pertencer a uma conta bancária. Nullable para não
-- quebrar nada antes da migração de dados (rodada logo abaixo neste mesmo script).
ALTER TABLE lancamentos ADD COLUMN conta_id BIGINT REFERENCES contas_bancarias(id) ON DELETE SET NULL;
CREATE INDEX lancamentos_conta_id ON lancamentos(conta_id);

-- Migração: cria uma "Conta Principal" por usuário com saldo_inicial calculado
-- para que o saldo total (soma das contas) continue batendo com o que o
-- dashboard já mostrava antes desta mudança (o cálculo antigo reiniciava a
-- cada ano a partir de saldos_abertura[ano], sem carregar anos anteriores).
INSERT INTO contas_bancarias (user_id, nome, saldo_inicial)
SELECT DISTINCT l.user_id, 'Conta Principal',
  COALESCE((SELECT valor FROM saldos_abertura sa WHERE sa.user_id = l.user_id AND sa.ano = EXTRACT(YEAR FROM CURRENT_DATE)), 0)
    - COALESCE((
        SELECT SUM(CASE WHEN l2.tipo = 'entrada' THEN l2.valor ELSE -l2.valor END)
        FROM lancamentos l2
        WHERE l2.user_id = l.user_id AND EXTRACT(YEAR FROM l2.data) <> EXTRACT(YEAR FROM CURRENT_DATE)
      ), 0)
FROM lancamentos l
WHERE NOT EXISTS (SELECT 1 FROM contas_bancarias cb WHERE cb.user_id = l.user_id);

UPDATE lancamentos l SET conta_id = cb.id
FROM contas_bancarias cb
WHERE cb.user_id = l.user_id AND cb.nome = 'Conta Principal' AND l.conta_id IS NULL;

-- Histórico de análises de IA — permite cachear o resultado do dia (evita
-- gastar créditos da API mais de uma vez por dia) e limitar o uso a 1x/dia.
CREATE TABLE analises_ia (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  mes_referencia TEXT,
  texto TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, data)
);
CREATE INDEX analises_ia_user_id ON analises_ia(user_id);
ALTER TABLE analises_ia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own analises_ia" ON analises_ia
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- Fase 3: cartões de crédito e faturas
-- ============================================================

CREATE TABLE cartoes_credito (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  banco TEXT,
  cor TEXT NOT NULL DEFAULT '#7C3AED',
  dia_fechamento INTEGER NOT NULL CHECK (dia_fechamento BETWEEN 1 AND 31),
  dia_vencimento INTEGER NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX cartoes_credito_user_id ON cartoes_credito(user_id);
ALTER TABLE cartoes_credito ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own cartoes_credito" ON cartoes_credito
  FOR ALL USING (auth.uid() = user_id);

-- Uma fatura por cartão por mês de competência ('YYYY-MM'). valor_total NÃO é
-- armazenado — é sempre somado ao vivo a partir de lancamentos.fatura_id,
-- mesmo padrão já usado para "cardTotal" no Dashboard (evita desincronizar).
CREATE TABLE faturas (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cartao_id BIGINT NOT NULL REFERENCES cartoes_credito(id) ON DELETE CASCADE,
  competencia TEXT NOT NULL,
  data_vencimento DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'paga')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(cartao_id, competencia)
);
CREATE INDEX faturas_cartao_id ON faturas(cartao_id);
ALTER TABLE faturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own faturas" ON faturas
  FOR ALL USING (auth.uid() = user_id);

-- Uma compra no cartão referencia cartao_id/fatura_id e NÃO conta_id — não
-- afeta o saldo bancário até a fatura ser paga (ver fluxo de pagamento no app).
ALTER TABLE lancamentos ADD COLUMN cartao_id BIGINT REFERENCES cartoes_credito(id) ON DELETE SET NULL;
ALTER TABLE lancamentos ADD COLUMN fatura_id BIGINT REFERENCES faturas(id) ON DELETE SET NULL;
CREATE INDEX lancamentos_cartao_id ON lancamentos(cartao_id);
CREATE INDEX lancamentos_fatura_id ON lancamentos(fatura_id);

-- ============================================================
-- Fase 4: metas e objetivos financeiros
-- ============================================================

CREATE TABLE metas (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  valor_alvo DECIMAL(12, 2) NOT NULL,
  data_alvo DATE,
  cor TEXT NOT NULL DEFAULT '#059669',
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'concluida', 'arquivada')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX metas_user_id ON metas(user_id);
ALTER TABLE metas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own metas" ON metas
  FOR ALL USING (auth.uid() = user_id);

-- valor_atual NÃO é armazenado — sempre somado ao vivo a partir de
-- metas_contribuicoes, mesmo padrão usado para faturas e categorias.
-- lancamento_id é opcional: quando a contribuição também representa uma
-- movimentação real (dinheiro saindo de uma conta), fica linkado a um
-- lançamento de verdade; se for só registro de progresso, fica null.
CREATE TABLE metas_contribuicoes (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  meta_id BIGINT NOT NULL REFERENCES metas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  valor DECIMAL(12, 2) NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  nota TEXT,
  lancamento_id BIGINT REFERENCES lancamentos(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX metas_contribuicoes_meta_id ON metas_contribuicoes(meta_id);
ALTER TABLE metas_contribuicoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own metas_contribuicoes" ON metas_contribuicoes
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- Fase 5: lançamentos recorrentes e orçamento por categoria
-- ============================================================

-- Template de lançamento recorrente (salário, aluguel, assinaturas). Os
-- lançamentos de verdade são gerados sob demanda (lazy, mesmo padrão de
-- ensureFatura) toda vez que o app carrega, cobrindo os meses entre
-- ultima_geracao e o mês atual — não depende de nenhum cron externo.
CREATE TABLE lancamentos_recorrentes (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  categoria TEXT NOT NULL,
  categoria_id BIGINT REFERENCES categorias(id) ON DELETE SET NULL,
  forma_pagamento TEXT NOT NULL DEFAULT 'pix' CHECK (forma_pagamento IN ('pix', 'cartao')),
  conta_id BIGINT REFERENCES contas_bancarias(id) ON DELETE SET NULL,
  cartao_id BIGINT REFERENCES cartoes_credito(id) ON DELETE SET NULL,
  valor DECIMAL(12, 2) NOT NULL,
  dia_mes INTEGER NOT NULL CHECK (dia_mes BETWEEN 1 AND 28),
  ativo BOOLEAN NOT NULL DEFAULT true,
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim DATE,
  ultima_geracao TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX lancamentos_recorrentes_user_id ON lancamentos_recorrentes(user_id);
ALTER TABLE lancamentos_recorrentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own lancamentos_recorrentes" ON lancamentos_recorrentes
  FOR ALL USING (auth.uid() = user_id);

ALTER TABLE lancamentos ADD COLUMN recorrente_id BIGINT REFERENCES lancamentos_recorrentes(id) ON DELETE SET NULL;
CREATE INDEX lancamentos_recorrente_id ON lancamentos(recorrente_id);

-- Orçamento mensal por categoria (recorrente, não por mês específico — vale
-- todo mês até ser alterado). Comparado ao vivo contra a soma de lancamentos
-- do mês corrente, mesmo padrão de "nunca armazenar total calculável".
CREATE TABLE orcamentos_categoria (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  categoria_id BIGINT NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  valor_limite DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, categoria_id)
);
CREATE INDEX orcamentos_categoria_user_id ON orcamentos_categoria(user_id);
ALTER TABLE orcamentos_categoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own orcamentos_categoria" ON orcamentos_categoria
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- Fase 6: notificações push no navegador
-- ============================================================

-- Uma linha por dispositivo/navegador inscrito (endpoint + chaves do Web
-- Push Protocol). last_notified_date evita reenviar o mesmo alerta todo dia.
CREATE TABLE push_subscriptions (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  last_notified_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX push_subscriptions_user_id ON push_subscriptions(user_id);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own push_subscriptions" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- Fase 7: recorrência/parcelamento em contas a pagar/receber
-- (substitui lancamentos_recorrentes — aquele modelo criava lançamentos
-- reais e mexia no saldo antes do pagamento acontecer de verdade; agora
-- tudo passa por contas_pagar/contas_receber, que só vira lançamento
-- quando o usuário marca como pago/recebido)
-- ============================================================

ALTER TABLE contas_pagar ADD COLUMN tipo_repeticao TEXT NOT NULL DEFAULT 'nenhuma' CHECK (tipo_repeticao IN ('nenhuma', 'recorrente', 'parcelado'));
ALTER TABLE contas_pagar ADD COLUMN periodo TEXT NOT NULL DEFAULT 'mensal' CHECK (periodo IN ('semanal', 'quinzenal', 'mensal'));
ALTER TABLE contas_pagar ADD COLUMN parcela_atual INTEGER;
ALTER TABLE contas_pagar ADD COLUMN parcela_total INTEGER;
UPDATE contas_pagar SET tipo_repeticao = 'recorrente' WHERE recorrente = true;
ALTER TABLE contas_pagar DROP COLUMN recorrente;

ALTER TABLE contas_receber ADD COLUMN tipo_repeticao TEXT NOT NULL DEFAULT 'nenhuma' CHECK (tipo_repeticao IN ('nenhuma', 'recorrente', 'parcelado'));
ALTER TABLE contas_receber ADD COLUMN periodo TEXT NOT NULL DEFAULT 'mensal' CHECK (periodo IN ('semanal', 'quinzenal', 'mensal'));
ALTER TABLE contas_receber ADD COLUMN parcela_atual INTEGER;
ALTER TABLE contas_receber ADD COLUMN parcela_total INTEGER;
UPDATE contas_receber SET tipo_repeticao = 'recorrente' WHERE recorrente = true;
ALTER TABLE contas_receber DROP COLUMN recorrente;

-- lancamentos_recorrentes descontinuado: apagamos os lançamentos que ele
-- já tinha gerado (restaura o saldo) e os templates, mas mantemos a tabela
-- (sem uso) para não quebrar a FK lancamentos.recorrente_id.
DELETE FROM lancamentos WHERE recorrente_id IS NOT NULL;
DELETE FROM lancamentos_recorrentes;

-- Permite reverter uma conta paga/recebida (desfazer) apagando o lançamento vinculado
ALTER TABLE contas_pagar ADD COLUMN lancamento_id BIGINT REFERENCES lancamentos(id) ON DELETE SET NULL;
ALTER TABLE contas_receber ADD COLUMN lancamento_id BIGINT REFERENCES lancamentos(id) ON DELETE SET NULL;

-- Subcategorias: uma categoria pode opcionalmente pertencer a outra (1 nível)
ALTER TABLE categorias ADD COLUMN parent_id BIGINT REFERENCES categorias(id) ON DELETE SET NULL;
CREATE INDEX categorias_parent_id ON categorias(parent_id);
