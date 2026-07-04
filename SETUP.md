# Guia de Setup: Controle Financeiro Pessoal

Tempo total estimado: **20-30 minutos**

---

## PASSO 1: Criar Conta GitHub

**Tempo: 5 min**

1. Acesse: https://github.com/signup
2. Preencha:
   - Email: use seu email pessoal (luandamasceno.03@gmail.com)
   - Crie uma senha
   - Choose a username (ex: "luan-damasceno" ou o que preferir)
3. Clique em "Create account"
4. Verifique seu email e confirme

**Pronto!** Você agora tem conta GitHub.

---

## PASSO 2: Criar Conta Supabase e Banco de Dados

**Tempo: 5 min**

1. Acesse: https://supabase.com/
2. Clique em "Start your project" ou "Sign up"
3. **Escolha "Continue with GitHub"** (usa a conta que acabou de criar)
4. Autorize o Supabase
5. Na página de criação do projeto:
   - **Name**: "controle-financeiro"
   - **Password**: crie uma senha (anote em algum lugar)
   - **Region**: escolha "South America (São Paulo)" ou a mais próxima
6. Clique em "Create new project"
7. Aguarde uns 30-60 segundos enquanto ele cria o banco

**Quando terminar, você verá um painel com:**
- Uma URL tipo: `https://seu-projeto.supabase.co`
- Duas chaves: `anon key` e `service role key`

**Copie essas duas chaves e guarde numa anotação ou note:**
```
URL: https://seu-projeto.supabase.co
Anon Key: eyJhbGci...
```

---

## PASSO 3: Criar as Tabelas no Banco de Dados

**Tempo: 5 min**

1. No painel do Supabase, no menu esquerdo, procure por **"SQL Editor"**
2. Clique em "New query"
3. **Cole TODO o SQL do arquivo `schema.sql`** (que está neste projeto)
4. Clique em **"Run"** (botão azul no canto direito)
5. Se aparecer "Success", pronto! As tabelas foram criadas.

**O que foi criado:**
- Tabela `lancamentos` (entradas e saídas)
- Tabela `contas_pagar` (contas a pagar)
- Tabela `contas_receber` (contas a receber)
- Tabela `previsoes` (previsão de recebimento por mês)

---

## PASSO 4: Criar Repositório no GitHub e Subir o Código

**Tempo: 5 min**

### 4.1: Criar o repositório

1. Acesse: https://github.com/new
2. Preencha:
   - **Repository name**: `controle-financeiro`
   - **Description**: "Dashboard financeiro pessoal com React e Supabase"
   - **Visibilidade**: deixe como "Public" (é grátis assim)
3. Clique em "Create repository"
4. Você verá uma página com instruções, ignore-as por enquanto

### 4.2: Subir o código do seu computador

1. Abra um **terminal** (Windows: PowerShell, Mac: Terminal, Linux: Terminal)
2. Navegue até a pasta do projeto:
   ```bash
   cd controle-financeiro
   ```
   (ajuste o caminho se salvou em outro local)

3. Execute os comandos abaixo NA ORDEM:
   ```bash
   git init
   git add .
   git commit -m "primeiro commit"
   git branch -M main
   git remote add origin https://github.com/SEU_USERNAME/controle-financeiro.git
   git push -u origin main
   ```

**IMPORTANTE:** Substitua `SEU_USERNAME` pelo username que criou no GitHub no Passo 1.

Se pedir para fazer login, clique em "Sign in with your browser" ou faça login direto.

**Quando terminar, acesse https://github.com/SEU_USERNAME/controle-financeiro e veja seu código lá!**

---

## PASSO 5: Configurar Variáveis de Ambiente no Vercel

**Tempo: 5 min**

### 5.1: Criar conta Vercel

1. Acesse: https://vercel.com/
2. Clique em "Sign Up"
3. **Escolha "Continue with GitHub"**
4. Autorize Vercel a acessar sua conta GitHub
5. Pronto, conta criada!

### 5.2: Deploy do projeto

1. No Vercel, clique em **"Add New..."** e depois **"Project"**
2. Procure pelo repositório `controle-financeiro` que acabou de subir
3. Clique em "Import"
4. Vercel vai pedir para configurar **Environment Variables**
5. Clique em **"Environment Variables"** e adicione essas duas:

```
NEXT_PUBLIC_SUPABASE_URL = https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = (a chave que copiou no Passo 2)
```

(Cole as chaves que guardou no Passo 2)

6. Clique em **"Deploy"**
7. Vercel vai começar a compilar e fazer deploy automaticamente (leva 2-3 min)

**Quando terminar, você verá um link tipo:**
```
https://controle-financeiro-seu-username.vercel.app
```

**Esse é seu app!** Clique no link e veja funcionando.

---

## PASSO 6: Usar o App

1. Acesse a URL do Vercel
2. **Crie sua conta:**
   - Email: qualquer um
   - Senha: qualquer uma (lembre dela)
3. **Faça login**
4. **Comece a adicionar seus lançamentos de junho!**

---

## Troubleshooting

### "Erro ao compilar / Deploy falhou"
- Verifique se as variáveis de ambiente estão certas no Vercel
- Tente fazer um novo deploy: na página do Vercel, clique em "Redeploy"

### "Página em branco / não carrega"
- Abra o console do navegador (F12)
- Procure por mensagens de erro vermelhas
- Verifique se a URL do Supabase está correta

### "Preciso atualizar o código depois"
- Modifique os arquivos no seu computador
- Execute no terminal:
  ```bash
  git add .
  git commit -m "descrição da mudança"
  git push
  ```
- Vercel vai detectar e fazer deploy automaticamente em poucos minutos

---

## Próximos passos (depois que estiver rodando)

- Comece a lançar seus gastos de junho
- Teste as funcionalidades (criar contas a pagar/receber, filtros, etc)
- Me avise se encontrar bugs ou quiser melhorias

**Dúvidas durante o setup?** Avise exatamente em qual passo travou.
