'use client';

import { useUser } from '@/contexts/UserContext';
import PainelExecutivo from '@/components/PainelExecutivo';

export default function ExecutivoPage() {
  const { user } = useUser();
  if (!user) return null;
  return <PainelExecutivo userId={user.id} />;
}
