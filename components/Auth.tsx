'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Mail, Lock, Loader } from 'lucide-react';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: authError } = isSignUp
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

      if (authError) throw authError;

      if (isSignUp) {
        setEmail('');
        setPassword('');
        setError('Cadastro realizado! Faça login com suas credenciais.');
        setIsSignUp(false);
      }
    } catch (err: any) {
      setError(err.message || 'Erro na autenticação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="flex items-center justify-center mb-6">
            <div className="w-12 h-12 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-white text-lg">
              R$
            </div>
          </div>

          <h1 className="text-2xl font-bold text-center text-slate-900 mb-2">
            Controle Financeiro Pessoal
          </h1>
          <p className="text-center text-slate-500 text-sm mb-6">
            {isSignUp ? 'Crie sua conta' : 'Faça login para começar'}
          </p>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full border border-slate-200 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Senha</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-slate-200 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
            </div>

            {error && (
              <div className={`p-3 rounded-lg text-sm ${
                error.includes('Cadastro') 
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-300 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader size={16} className="animate-spin" />}
              {isSignUp ? 'Criar conta' : 'Entrar'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200 text-center text-sm text-slate-600">
            {isSignUp ? (
              <>
                Já tem conta?{' '}
                <button
                  onClick={() => setIsSignUp(false)}
                  className="text-emerald-600 hover:text-emerald-700 font-semibold"
                >
                  Faça login
                </button>
              </>
            ) : (
              <>
                Não tem conta?{' '}
                <button
                  onClick={() => setIsSignUp(true)}
                  className="text-emerald-600 hover:text-emerald-700 font-semibold"
                >
                  Criar conta
              </button>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-slate-400 text-xs mt-6">
          Seus dados são privados e criptografados.
        </p>
      </div>
    </div>
  );
}
