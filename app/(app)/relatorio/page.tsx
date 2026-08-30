'use client';

import { Suspense } from 'react';
import { useUser } from '@/contexts/UserContext';
import RelatorioMensal from '@/components/RelatorioMensal';

export default function RelatorioPage() {
  const { user } = useUser();
  if (!user) return null;
  return (
    <Suspense fallback={null}>
      <RelatorioMensal userId={user.id} />
    </Suspense>
  );
}
