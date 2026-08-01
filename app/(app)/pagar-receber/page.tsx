'use client';

import { useUser } from '@/contexts/UserContext';
import ContasPagarReceber from '@/components/ContasPagarReceber';

export default function PagarReceberPage() {
  const { user } = useUser();
  if (!user) return null;
  return <ContasPagarReceber userId={user.id} />;
}
