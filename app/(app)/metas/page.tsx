'use client';

import { useUser } from '@/contexts/UserContext';
import Metas from '@/components/Metas';

export default function MetasPage() {
  const { user } = useUser();
  if (!user) return null;
  return <Metas userId={user.id} />;
}
