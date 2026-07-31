'use client';

import { useUser } from '@/contexts/UserContext';
import Orcamentos from '@/components/Orcamentos';

export default function OrcamentosPage() {
  const { user } = useUser();
  if (!user) return null;
  return <Orcamentos userId={user.id} />;
}
