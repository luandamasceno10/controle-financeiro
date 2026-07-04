# Controle Financeiro Pessoal

Dashboard financeiro pessoal com React, Next.js, Supabase e Tailwind CSS.

## O que é?

Uma aplicação para rastrear onde seu dinheiro vai cada mês. Você registra entradas e saídas, categoriza seus gastos, acompanha contas a pagar/receber e vê tudo em gráficos e relatórios.

## Funcionalidades

- 📊 Gráficos de despesas por categoria
- 💳 Comparação Pix vs Cartão
- 📋 Contas a pagar e a receber com recorrência
- 📅 Visão mensal e anual
- 🔒 Autenticação privada (seus dados só são seus)
- 📱 Responsivo para mobile

## Primeiros passos

Veja o arquivo `SETUP.md` para instruções passo a passo de:
1. Criar conta GitHub
2. Criar banco de dados Supabase
3. Configurar Vercel para deploy
4. Usar o app

**Tempo total:** ~20-30 minutos

## Tech Stack

- **Frontend:** React 18 + Next.js 14 + TypeScript
- **Styling:** Tailwind CSS
- **Backend:** Supabase (PostgreSQL + Auth)
- **Hosting:** Vercel
- **Charts:** Recharts

## Desenvolvimento local

```bash
npm install
npm run dev
```

Acesse http://localhost:3000

## Estrutura do Projeto

```
controle-financeiro/
├── app/              # Páginas e layout do Next.js
├── components/       # Componentes React
├── lib/              # Utilitários (Supabase client)
├── schema.sql        # Definição das tabelas
├── SETUP.md          # Guia de configuração
└── package.json      # Dependências
```

## Banco de Dados

Quatro tabelas principais:
- `lancamentos` - Entradas e saídas
- `contas_pagar` - Contas a pagar
- `contas_receber` - Contas a receber
- `previsoes` - Previsão de recebimento por mês

Veja `schema.sql` para detalhes.

## Suporte

Encontrou um bug ou quer melhorias? Comunique.
