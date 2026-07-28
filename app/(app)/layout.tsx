'use client';

import { useEffect } from 'react';
import { UserProvider, useUser } from '@/contexts/UserContext';
import { ensureDefaultCategorias } from '@/lib/categorias';
import Auth from '@/components/Auth';
import AppShell from '@/components/AppShell';

function Gate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser();

  useEffect(() => {
    if (user) ensureDefaultCategorias(user.id);
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return <AppShell>{children}</AppShell>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <Gate>{children}</Gate>
    </UserProvider>
  );
}
