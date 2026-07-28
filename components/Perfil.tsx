'use client';

import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useToast, ToastContainer } from './Toast';
import { UserCircle, Lock, Loader } from 'lucide-react';

export default function Perfil({ user }: { user: User }) {
  const { toasts, addToast, removeToast } = useToast();

  const [nome, setNome] = useState(user.user_metadata?.nome_preferido || '');
  const [savingNome, setSavingNome] = useState(false);

  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [savingSenha, setSavingSenha] = useState(false);

  const handleSaveNome = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingNome(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { nome_preferido: nome } });
      if (error) throw error;
      addToast('Nome atualizado!', 'success');
    } catch (err: any) {
      addToast('Erro ao salvar: ' + err.message, 'error');
    } finally {
      setSavingNome(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (novaSenha.length < 6) {
      addToast('A senha deve ter pelo menos 6 caracteres', 'error');
      return;
    }
    if (novaSenha !== confirmarSenha) {
      addToast('As senhas não coincidem', 'error');
      return;
    }

    setSavingSenha(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) throw error;
      addToast('Senha alterada com sucesso!', 'success');
      setNovaSenha('');
      setConfirmarSenha('');
    } catch (err: any) {
      addToast('Erro ao alterar senha: ' + err.message, 'error');
    } finally {
      setSavingSenha(false);
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-5 py-8 space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
          <UserCircle size={16} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Perfil</h1>
          <p className="text-xs text-slate-400">Suas informações e preferências</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Informações básicas</h2>
        <form onSubmit={handleSaveNome} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Email</label>
            <input
              type="text"
              value={user.email || ''}
              disabled
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-slate-50 text-slate-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Como você gostaria de ser chamado?</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Seu nome ou apelido"
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800"
              disabled={savingNome}
            />
          </div>
          <button
            type="submit"
            disabled={savingNome}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-400 text-slate-900 font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors"
          >
            {savingNome && <Loader size={15} className="animate-spin" />}
            {savingNome ? 'Salvando...' : 'Salvar'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lock size={15} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">Alterar senha</h2>
        </div>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Nova senha</label>
            <input
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800"
              disabled={savingSenha}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Confirmar nova senha</label>
            <input
              type="password"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800"
              disabled={savingSenha}
            />
          </div>
          <button
            type="submit"
            disabled={savingSenha || !novaSenha}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-400 text-white font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors"
          >
            {savingSenha && <Loader size={15} className="animate-spin" />}
            {savingSenha ? 'Alterando...' : 'Alterar senha'}
          </button>
        </form>
      </div>
    </main>
  );
}
