'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-sm w-full text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <AlertTriangle size={22} />
        </div>
        <div>
          <h1 className="font-semibold text-slate-800">Algo deu errado</h1>
          <p className="text-sm text-slate-500 mt-1">Essa tela encontrou um erro inesperado. Tente novamente — se persistir, saia e entre de novo no app.</p>
        </div>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors"
        >
          <RotateCcw size={15} /> Tentar de novo
        </button>
      </div>
    </div>
  );
}
