'use client';

import { useUser } from '@/contexts/UserContext';
import CartoesCredito from '@/components/CartoesCredito';

export default function CartoesPage() {
  const { user } = useUser();
  if (!user) return null;
  return <CartoesCredito userId={user.id} />;
}
