import { Target } from 'lucide-react';

export default function MetasPage() {
  return (
    <main className="max-w-6xl mx-auto px-5 py-10">
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
        <div className="w-12 h-12 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center mx-auto mb-4">
          <Target size={22} />
        </div>
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Metas e Objetivos</h2>
        <p className="text-xs text-slate-400">Em breve — defina metas e acompanhe seu progresso.</p>
      </div>
    </main>
  );
}
