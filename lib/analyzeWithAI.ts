import { supabase } from './supabase';

export async function analyzeFinances(resumo: Record<string, any>) {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ resumo }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Erro ao analisar finanças");
  }

  const data = await response.json();
  return data.text;
}
