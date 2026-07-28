'use client';

import { useUser } from '@/contexts/UserContext';
import CategoriaEditor from '@/components/CategoriaEditor';

export default function CategoriasPage() {
  const { user } = useUser();
  if (!user) return null;
  return <CategoriaEditor userId={user.id} />;
}
