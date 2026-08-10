'use client';

import { useUser } from '@/contexts/UserContext';
import GlobalSearch from '@/components/GlobalSearch';

export default function BuscarPage() {
  const { user } = useUser();
  if (!user) return null;
  return <GlobalSearch userId={user.id} />;
}
