'use client';

import { useUser } from '@/contexts/UserContext';
import LancamentosRecorrentes from '@/components/LancamentosRecorrentes';

export default function RecorrentesPage() {
  const { user } = useUser();
  if (!user) return null;
  return <LancamentosRecorrentes userId={user.id} />;
}
