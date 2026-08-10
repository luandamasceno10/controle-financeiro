'use client';

import { useState } from 'react';
import { verifyBiometric } from '@/lib/biometric';
import { Fingerprint, Loader } from 'lucide-react';

export default function AppLock({ onUnlock }: { onUnlock: () => void }) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const tryUnlock = async () => {
    setChecking(true);
    setError('');
    try {
      const ok = await verifyBiometric();
      if (ok) onUnlock();
      else setError('Não foi possível confirmar sua identidade. Tente novamente.');
    } catch {
      setError('Não foi possível confirmar sua identidade. Tente novamente.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500 flex items-center justify-center font-bold text-white text-xl mx-auto mb-6">R$</div>
        <h1 className="text-lg font-semibold text-white mb-1">Controle Financeiro</h1>
        <p className="text-sm text-slate-400 mb-8">Confirme sua identidade para continuar</p>
        <button
          onClick={tryUnlock}
          disabled={checking}
          className="w-20 h-20 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center mx-auto transition-colors disabled:opacity-50"
        >
          {checking ? <Loader size={28} className="text-white animate-spin" /> : <Fingerprint size={32} className="text-white" />}
        </button>
        {error && <p className="text-xs text-rose-400 mt-4">{error}</p>}
        <p className="text-xs text-slate-500 mt-6">Toque no ícone para desbloquear com Face ID / Touch ID</p>
      </div>
    </div>
  );
}
