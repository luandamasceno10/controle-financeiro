'use client';

import { useUser } from '@/contexts/UserContext';
import Home from '@/components/Home';

export default function HomePage() {
  const { user } = useUser();
  if (!user) return null;
  return <Home userId={user.id} nome={user.user_metadata?.nome_preferido} />;
}
