'use client';

import { useUser } from '@/contexts/UserContext';
import Dashboard from '@/components/Dashboard';

export default function DashboardPage() {
  const { user } = useUser();
  if (!user) return null;
  return <Dashboard userId={user.id} />;
}
