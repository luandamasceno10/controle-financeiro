import { supabase } from '@/lib/supabase';
import type { CartaoCredito } from '@/lib/supabase';
import { competenciaForPurchase, ensureFatura } from '@/lib/faturas';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Gera, sob demanda, os lançamentos de todos os meses que faltam para cada
// template recorrente ativo — do mesmo jeito que ensureFatura cria faturas
// preguiçosamente. Chamado sempre que o app carrega (Home/Dashboard), então
// não depende de nenhum cron externo: se o usuário passou 3 meses sem abrir
// o app, os 3 lançamentos de aluguel são criados de uma vez na próxima visita.
export async function ensureRecorrentesGerados(userId: string) {
  const { data: recorrentes } = await supabase
    .from('lancamentos_recorrentes')
    .select('*')
    .eq('user_id', userId)
    .eq('ativo', true);
  if (!recorrentes || recorrentes.length === 0) return;

  const hojeISO = todayISO();
  let cartoesCache: CartaoCredito[] | null = null;

  for (const r of recorrentes) {
    const inicio = new Date(r.data_inicio + 'T00:00:00');
    let cursor = r.ultima_geracao
      ? (() => {
          const [y, m] = r.ultima_geracao.split('-').map(Number);
          return new Date(y, m, 1);
        })()
      : new Date(inicio.getFullYear(), inicio.getMonth(), 1);

    let ultimaGeracao: string | null = r.ultima_geracao;

    while (true) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      const ocorrencia = new Date(y, m, r.dia_mes);
      const ocorrenciaISO = ocorrencia.toISOString().slice(0, 10);

      if (ocorrenciaISO > hojeISO) break;
      if (r.data_fim && ocorrenciaISO > r.data_fim) break;
      if (ocorrenciaISO < r.data_inicio) {
        cursor = new Date(y, m + 1, 1);
        continue;
      }

      const payload: any = {
        user_id: userId,
        data: ocorrenciaISO,
        descricao: r.descricao,
        tipo: r.tipo,
        categoria: r.categoria,
        categoria_id: r.categoria_id,
        forma_pagamento: r.forma_pagamento,
        conta_id: null,
        cartao_id: null,
        fatura_id: null,
        recorrente_id: r.id,
        valor: r.valor,
      };

      if (r.forma_pagamento === 'cartao' && r.cartao_id) {
        if (!cartoesCache) {
          const { data } = await supabase.from('cartoes_credito').select('*').eq('user_id', userId);
          cartoesCache = data || [];
        }
        const cartao = cartoesCache.find((c) => c.id === r.cartao_id);
        if (cartao) {
          const competencia = competenciaForPurchase(ocorrenciaISO, cartao.dia_fechamento);
          const fatura = await ensureFatura(cartao, competencia, userId);
          payload.cartao_id = cartao.id;
          payload.fatura_id = fatura.id;
        }
      } else {
        payload.conta_id = r.conta_id;
      }

      await supabase.from('lancamentos').insert([payload]);

      ultimaGeracao = `${y}-${String(m + 1).padStart(2, '0')}`;
      cursor = new Date(y, m + 1, 1);
    }

    if (ultimaGeracao !== r.ultima_geracao) {
      await supabase.from('lancamentos_recorrentes').update({ ultima_geracao: ultimaGeracao }).eq('id', r.id);
    }
  }
}
