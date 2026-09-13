'use client';

import { useUser } from '@/contexts/UserContext';
import Patrimonio from '@/components/Patrimonio';

export default function PatrimonioPage() {
  const { user } = useUser();
  if (!user) return null;
  return <Patrimonio userId={user.id} />;
}
