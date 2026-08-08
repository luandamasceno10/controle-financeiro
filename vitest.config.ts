import { defineConfig } from 'vitest/config';
import path from 'node:path';

// lib/faturas.ts importa lib/supabase.ts, que cria o client Supabase no
// top-level do módulo — sem essas variáveis o import falha mesmo em testes
// que nunca chamam o Supabase de verdade (só as funções puras de cálculo).
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
});
