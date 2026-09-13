'use client';

import { useEffect, useState } from 'react';
import { UserProvider, useUser } from '@/contexts/UserContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ensureDefaultCategorias, ensureCategoriaCartaoCredito } from '@/lib/categorias';
import { biometricEnabled } from '@/lib/biometric';
import { mfaNeedsChallenge, mfaStatus } from '@/lib/mfa';
import Auth from '@/components/Auth';
import AppShell from '@/components/AppShell';
import AppLock from '@/components/AppLock';
import MfaChallenge from '@/components/MfaChallenge';

function Gate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser();
  // O bloqueio é por sessão de app (reseta a cada carregamento da página),
  // não por navegação entre rotas — não pede biometria de novo a cada clique.
  const [unlocked, setUnlocked] = useState(false);
  // undefined = ainda checando o nível de autenticação; string = precisa do
  // código (guarda o factorId); null = já está em AAL2 (ou 2FA desativado).
  const [mfaFactorId, setMfaFactorId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (user) { ensureDefaultCategorias(user.id); ensureCategoriaCartaoCredito(user.id); }
  }, [user]);

  useEffect(() => {
    if (!user) { setMfaFactorId(undefined); return; }
    mfaNeedsChallenge().then(async (precisa) => {
      if (!precisa) { setMfaFactorId(null); return; }
      const { factorId } = await mfaStatus();
      setMfaFactorId(factorId);
    });
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-slate-600 dark:text-slate-300">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  if (mfaFactorId === undefined) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-slate-600 dark:text-slate-300">Carregando...</div>
      </div>
    );
  }

  if (mfaFactorId) {
    return <MfaChallenge factorId={mfaFactorId} onVerified={() => setMfaFactorId(null)} />;
  }

  if (biometricEnabled() && !unlocked) {
    return <AppLock onUnlock={() => setUnlocked(true)} />;
  }

  return <AppShell>{children}</AppShell>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <UserProvider>
        <Gate>{children}</Gate>
      </UserProvider>
    </ThemeProvider>
  );
}
