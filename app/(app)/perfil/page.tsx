'use client';

import { useUser } from '@/contexts/UserContext';
import Perfil from '@/components/Perfil';

export default function PerfilPage() {
  const { user } = useUser();
  if (!user) return null;
  return <Perfil user={user} />;
}
