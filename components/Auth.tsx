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
  const [forgotPassword, setForgotPassword] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: authError } = isSignUp
        ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
        : await supabase.auth.signInWithPassword({ email, password });

      if (authError) throw authError;

      if (isSignUp) {
        setEmail('');
        setPassword('');
        setError(`Cadastro criado! Enviamos um e-mail de confirmação — clique no link para ativar sua conta antes de entrar.`);
        setIsSignUp(false);
      }
    } catch (err: any) {
      setError(err.message || 'Erro na autenticação');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      if (resetError) throw resetError;
      setError('Enviamos um link de redefinição de senha para o seu e-mail. Confira também a caixa de spam.');
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar e-mail de redefinição');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8">
          <div className="flex items-center justify-center mb-6">
            <div className="w-12 h-12 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-white text-lg">
              R$
            </div>
          </div>

          <h1 className="text-2xl font-bold text-center text-slate-900 mb-2">
            Controle Financeiro Pessoal
          </h1>
          <p className="text-center text-slate-500 dark:text-slate-400 text-sm mb-6">
            {forgotPassword ? 'Redefinir senha' : isSignUp ? 'Crie sua conta' : 'Faça login para começar'}
          </p>

          <form onSubmit={forgotPassword ? handleForgotPassword : handleAuth} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-slate-700 dark:text-slate-100"
                  required
                />
              </div>
            </div>

            {!forgotPassword && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block">Senha</label>
                  {!isSignUp && (
                    <button type="button" onClick={() => { setForgotPassword(true); setError(''); }} className="text-xs font-medium text-emerald-600 hover:text-emerald-700">
                      Esqueceu a senha?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-slate-700 dark:text-slate-100"
                    required
                  />
                </div>
              </div>
            )}

            {error && (
              <div className={`p-3 rounded-lg text-sm ${
                error.includes('Cadastro') || error.includes('Enviamos')
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 border border-rose-200'
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
              {forgotPassword ? 'Enviar link de redefinição' : isSignUp ? 'Criar conta' : 'Entrar'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700 text-center text-sm text-slate-600 dark:text-slate-300">
            {forgotPassword ? (
              <button
                onClick={() => { setForgotPassword(false); setError(''); }}
                className="text-emerald-600 hover:text-emerald-700 font-semibold"
              >
                Voltar para o login
              </button>
            ) : isSignUp ? (
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

        <p className="text-center text-slate-400 dark:text-slate-500 text-xs mt-6">
          Seus dados são privados e criptografados.
        </p>
      </div>
    </div>
  );
}
