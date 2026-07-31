export async function suggestCategoria(descricao: string, categorias: string[]): Promise<string | null> {
  try {
    const response = await fetch('/api/categorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descricao, categorias }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.categoria;
  } catch {
    return null;
  }
}
