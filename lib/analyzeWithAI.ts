export async function analyzeFinances(entries: any[], totals: any, monthName: string) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries, totals, monthName }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Erro ao analisar finanças");
  }

  const data = await response.json();
  return data.text;
}
