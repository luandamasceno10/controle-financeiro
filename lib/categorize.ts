import { supabase } from './supabase';

// Normaliza uma descrição de lançamento pra comparação por semelhança: tira
// acento, caixa, números (data/código/parcela variam entre a mesma compra
// lançada em momentos diferentes) e pontuação — sobra só o "nome" da compra.
// Ex.: "UBER *TRIP HELP.UBER.C 12/34" e "Uber" viram ambas "uber".
export function normalizarDescricao(desc: string): string {
  return desc
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\d+/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface HistoricoCategoria {
  descricaoNorm: string;
  categoria: string;
}

// Acha a categoria de uma compra parecida no histórico: primeiro tenta bater
// exatamente (já normalizado), depois aceita quando um nome contém o outro
// por inteiro (ex.: "ifood" dentro de "ifood clone"), sempre exigindo um
// mínimo de caracteres pros dois lados pra não confundir nomes curtos/comuns.
export function categoriaPorHistorico(descricao: string, historico: HistoricoCategoria[]): string | null {
  const alvo = normalizarDescricao(descricao);
  if (alvo.length < 3) return null;
  const exato = historico.find((h) => h.descricaoNorm === alvo);
  if (exato) return exato.categoria;
  const parecido = historico.find((h) => h.descricaoNorm.length >= 4 && (alvo.includes(h.descricaoNorm) || h.descricaoNorm.includes(alvo)));
  return parecido ? parecido.categoria : null;
}

export async function suggestCategoria(descricao: string, categorias: string[]): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('/api/categorize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ descricao, categorias }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.categoria;
  } catch {
    return null;
  }
}
