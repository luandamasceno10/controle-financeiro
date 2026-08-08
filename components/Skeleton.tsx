// Placeholder de carregamento — usado no lugar de um texto "Carregando..."
// estático, pra passar a sensação de que a tela já está montada e só os
// dados estão a caminho (em vez de um estado indefinido/vazio).
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4 animate-pulse">
          <div className="w-9 h-9 rounded-lg bg-slate-200 dark:bg-slate-700 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-2.5 w-1/4 rounded bg-slate-100 dark:bg-slate-800" />
          </div>
          <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
      ))}
    </div>
  );
}
