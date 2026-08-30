export interface CategoriaSlice {
  name: string;
  value: number;
  icone?: string;
}

// A cor cadastrada na categoria não é confiável (muitas categorias antigas do
// usuário compartilham a mesma cor padrão) — usa a paleta categórica fixa
// (--series-1..8, ver app/globals.css) por posição no ranking, que garante
// fatias sempre distinguíveis. Categorias além do limite viram "Outras".
export function toDonutSlices<T extends CategoriaSlice>(items: T[], maxSlices = 6): (T & { color: string })[] {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  if (sorted.length <= maxSlices + 1) {
    return sorted.map((c, i) => ({ ...c, color: `var(--series-${i + 1})` }));
  }
  const top = sorted.slice(0, maxSlices).map((c, i) => ({ ...c, color: `var(--series-${i + 1})` }));
  const outrasValue = sorted.slice(maxSlices).reduce((s, c) => s + c.value, 0);
  return [...top, { name: 'Outras', value: outrasValue, color: 'var(--chart-text)' } as T & { color: string }];
}
