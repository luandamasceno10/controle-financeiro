import { Landmark } from 'lucide-react';

export default function ContasPage() {
  return (
    <main className="max-w-6xl mx-auto px-5 py-10">
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
        <div className="w-12 h-12 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center mx-auto mb-4">
          <Landmark size={22} />
        </div>
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Contas Bancárias</h2>
        <p className="text-xs text-slate-400">Em breve — cadastro de contas bancárias e saldo por conta.</p>
      </div>
    </main>
  );
}
