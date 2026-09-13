'use client';

import { useUser } from '@/contexts/UserContext';
import Auditoria from '@/components/Auditoria';

export default function HistoricoPage() {
  const { user } = useUser();
  if (!user) return null;
  return <Auditoria userId={user.id} />;
}
