import { supabase } from './supabase';

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
