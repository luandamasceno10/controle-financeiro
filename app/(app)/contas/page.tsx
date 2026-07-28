'use client';

import { useUser } from '@/contexts/UserContext';
import ContasBancarias from '@/components/ContasBancarias';

export default function ContasPage() {
  const { user } = useUser();
  if (!user) return null;
  return <ContasBancarias userId={user.id} />;
}
