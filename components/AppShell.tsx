'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home as HomeIcon, LayoutDashboard, Landmark, CreditCard, Target, Tag, UserCircle, LogOut, Menu, X, Repeat } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const NAV_ITEMS = [
  { href: '/', label: 'Início', icon: HomeIcon },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/contas', label: 'Contas Bancárias', icon: Landmark },
  { href: '/cartoes', label: 'Cartões de Crédito', icon: CreditCard },
  { href: '/recorrentes', label: 'Recorrentes', icon: Repeat },
  { href: '/metas', label: 'Metas', icon: Target },
  { href: '/categorias', label: 'Categorias', icon: Tag },
  { href: '/perfil', label: 'Perfil', icon: UserCircle },
];

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 px-3 py-4 space-y-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              active ? 'bg-emerald-500 text-slate-900' : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Icon size={17} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col bg-slate-900 text-white shrink-0">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-slate-900">R$</div>
          <h1 className="text-sm font-semibold leading-tight">Controle Financeiro</h1>
        </div>
        <NavLinks pathname={pathname} />
        <div className="p-3 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <LogOut size={17} /> Sair
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-40 bg-slate-900 text-white">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-slate-900 text-sm">R$</div>
            <h1 className="text-sm font-semibold">Controle Financeiro</h1>
          </div>
          <button onClick={() => setDrawerOpen(true)} className="p-2 rounded-lg hover:bg-slate-800">
            <Menu size={20} />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setDrawerOpen(false)} />
          <div className="relative w-64 bg-slate-900 text-white flex flex-col">
            <div className="flex items-center justify-between px-5 py-5">
              <h1 className="text-sm font-semibold">Menu</h1>
              <button onClick={() => setDrawerOpen(false)} className="p-1 rounded-lg hover:bg-slate-800">
                <X size={18} />
              </button>
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
            <div className="p-3 border-t border-slate-800">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <LogOut size={17} /> Sair
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
