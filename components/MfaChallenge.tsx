'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { mfaVerifyLogin } from '@/lib/mfa';
import { ShieldCheck, Loader } from 'lucide-react';

export default function MfaChallenge({ factorId, onVerified }: { factorId: string; onVerified: () => void }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await mfaVerifyLogin(factorId, code);
      onVerified();
    } catch (err: any) {
      setError(err.message || 'Código inválido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 rounded-lg bg-violet-50 dark:bg-violet-500/10 text-violet-600 flex items-center justify-center">
              <ShieldCheck size={22} />
            </div>
          </div>
          <h1 className="text-lg font-bold text-center text-slate-900 dark:text-slate-100 mb-1">Verificação em duas etapas</h1>
          <p className="text-center text-slate-500 dark:text-slate-400 text-sm mb-6">Digite o código do seu aplicativo autenticador</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full text-center text-2xl tracking-[0.5em] border border-slate-200 dark:border-slate-700 rounded-lg py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-slate-700 dark:text-slate-100"
              required
            />
            {error && (
              <div className="p-3 rounded-lg text-sm bg-rose-50 dark:bg-rose-500/10 text-rose-700 border border-rose-200">{error}</div>
            )}
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-300 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader size={16} className="animate-spin" />}
              Confirmar
            </button>
          </form>
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full text-center text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 mt-6"
          >
            Voltar para o login
          </button>
        </div>
      </div>
    </div>
  );
}
