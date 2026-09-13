'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { pushSupported, getPushSubscriptionStatus, subscribeToPush, unsubscribeFromPush } from '@/lib/push-client';
import { biometricEnabled, biometricAvailable, enableBiometric, disableBiometric } from '@/lib/biometric';
import { mfaStatus, mfaEnroll, mfaConfirmEnroll, mfaUnenroll } from '@/lib/mfa';
import { useToast, ToastContainer } from './Toast';
import { UserCircle, Lock, Loader, Bell, BellOff, Mail, Fingerprint, ShieldCheck } from 'lucide-react';

export default function Perfil({ user }: { user: User }) {
  const { toasts, addToast, removeToast } = useToast();

  const [nome, setNome] = useState(user.user_metadata?.nome_preferido || '');
  const [savingNome, setSavingNome] = useState(false);

  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [savingSenha, setSavingSenha] = useState(false);

  const [novoEmail, setNovoEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  const [pushStatus, setPushStatus] = useState<'subscribed' | 'not-subscribed' | 'unsupported' | 'loading'>('loading');
  const [pushBusy, setPushBusy] = useState(false);

  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);

  const [mfaEnrolled, setMfaEnrolled] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  const loadMfaStatus = () => mfaStatus().then(({ enrolled, factorId }) => { setMfaEnrolled(enrolled); setMfaFactorId(factorId); });

  useEffect(() => {
    getPushSubscriptionStatus().then(setPushStatus);
    biometricAvailable().then(setBioAvailable);
    setBioEnabled(biometricEnabled());
    loadMfaStatus();
  }, []);

  const handleStartMfaEnroll = async () => {
    setMfaBusy(true);
    try {
      const setup = await mfaEnroll();
      setMfaSetup(setup);
    } catch (err: any) {
      addToast('Erro ao iniciar verificação em duas etapas: ' + err.message, 'error');
    } finally {
      setMfaBusy(false);
    }
  };

  const handleConfirmMfaEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaSetup || mfaCode.length !== 6) return;
    setMfaBusy(true);
    try {
      await mfaConfirmEnroll(mfaSetup.factorId, mfaCode);
      setMfaSetup(null);
      setMfaCode('');
      await loadMfaStatus();
      addToast('Verificação em duas etapas ativada! No próximo login vamos pedir o código.', 'success');
    } catch (err: any) {
      addToast('Código inválido: ' + err.message, 'error');
    } finally {
      setMfaBusy(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!mfaFactorId) return;
    setMfaBusy(true);
    try {
      await mfaUnenroll(mfaFactorId);
      await loadMfaStatus();
      addToast('Verificação em duas etapas desativada', 'success');
    } catch (err: any) {
      addToast('Erro ao desativar: ' + err.message, 'error');
    } finally {
      setMfaBusy(false);
    }
  };

  const handleToggleBiometric = async () => {
    setBioBusy(true);
    try {
      if (bioEnabled) {
        disableBiometric();
        setBioEnabled(false);
        addToast('Bloqueio por biometria desativado', 'success');
      } else {
        await enableBiometric(user.id, user.email || 'usuário');
        setBioEnabled(true);
        addToast('Bloqueio por biometria ativado! Da próxima vez que abrir o app, ele vai pedir Face ID/Touch ID.', 'success');
      }
    } catch (err: any) {
      addToast('Erro ao configurar biometria: ' + err.message, 'error');
    } finally {
      setBioBusy(false);
    }
  };

  const handleTogglePush = async () => {
    setPushBusy(true);
    try {
      if (pushStatus === 'subscribed') {
        await unsubscribeFromPush();
        setPushStatus('not-subscribed');
        addToast('Notificações desativadas', 'success');
      } else {
        await subscribeToPush(user.id);
        setPushStatus('subscribed');
        addToast('Notificações ativadas!', 'success');
      }
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setPushBusy(false);
    }
  };

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

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoEmail || novoEmail === user.email) return;

    setSavingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser(
        { email: novoEmail },
        { emailRedirectTo: window.location.origin }
      );
      if (error) throw error;
      addToast('Enviamos um e-mail de confirmação para o novo endereço — clique no link para concluir a troca.', 'success');
      setNovoEmail('');
    } catch (err: any) {
      addToast('Erro ao alterar e-mail: ' + err.message, 'error');
    } finally {
      setSavingEmail(false);
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
        <div className="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-500/10 text-violet-600 flex items-center justify-center">
          <UserCircle size={16} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Perfil</h1>
          <p className="text-xs text-slate-400 dark:text-slate-500">Suas informações e preferências</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Informações básicas</h2>
        <form onSubmit={handleSaveNome} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Email</label>
            <input
              type="text"
              value={user.email || ''}
              disabled
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Como você gostaria de ser chamado?</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Seu nome ou apelido"
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100"
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

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Mail size={15} className="text-slate-400 dark:text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Alterar e-mail</h2>
        </div>
        <form onSubmit={handleChangeEmail} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Novo e-mail</label>
            <input
              type="email"
              value={novoEmail}
              onChange={(e) => setNovoEmail(e.target.value)}
              placeholder={user.email || 'novo@email.com'}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100"
              disabled={savingEmail}
            />
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Enviaremos um link de confirmação para o novo endereço — a troca só vale depois de clicar nele.</p>
          </div>
          <button
            type="submit"
            disabled={savingEmail || !novoEmail || novoEmail === user.email}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-400 text-white font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors"
          >
            {savingEmail && <Loader size={15} className="animate-spin" />}
            {savingEmail ? 'Enviando...' : 'Alterar e-mail'}
          </button>
        </form>
      </div>

      {pushStatus !== 'unsupported' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                {pushStatus === 'subscribed' ? <Bell size={16} /> : <BellOff size={16} />}
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Notificações push</h2>
                <p className="text-xs text-slate-400 dark:text-slate-500">Fatura vencendo, conta atrasada, meta fora do ritmo</p>
              </div>
            </div>
            <button
              onClick={handleTogglePush}
              disabled={pushBusy || pushStatus === 'loading'}
              className={`shrink-0 flex items-center gap-2 font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50 ${
                pushStatus === 'subscribed' ? 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900'
              }`}
            >
              {pushBusy && <Loader size={13} className="animate-spin" />}
              {pushStatus === 'subscribed' ? 'Desativar' : 'Ativar'}
            </button>
          </div>
        </div>
      )}

      {bioAvailable && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-500/10 text-violet-600 flex items-center justify-center shrink-0">
                <Fingerprint size={16} />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Abrir com Face ID / Touch ID</h2>
                <p className="text-xs text-slate-400 dark:text-slate-500">Pede biometria neste aparelho antes de mostrar seus dados</p>
              </div>
            </div>
            <button
              onClick={handleToggleBiometric}
              disabled={bioBusy}
              className={`shrink-0 flex items-center gap-2 font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50 ${
                bioEnabled ? 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900'
              }`}
            >
              {bioBusy && <Loader size={13} className="animate-spin" />}
              {bioEnabled ? 'Desativar' : 'Ativar'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-500/10 text-violet-600 flex items-center justify-center shrink-0">
              <ShieldCheck size={16} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Verificação em duas etapas</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500">Pede um código do seu aplicativo autenticador (Google Authenticator, Authy) além da senha, no login</p>
            </div>
          </div>
          {!mfaSetup && (
            <button
              onClick={mfaEnrolled ? handleDisableMfa : handleStartMfaEnroll}
              disabled={mfaBusy}
              className={`shrink-0 flex items-center gap-2 font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50 ${
                mfaEnrolled ? 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900'
              }`}
            >
              {mfaBusy && <Loader size={13} className="animate-spin" />}
              {mfaEnrolled ? 'Desativar' : 'Ativar'}
            </button>
          )}
        </div>
        {mfaSetup && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Escaneie o QR code com seu app autenticador e digite o código de 6 dígitos pra confirmar.</p>
            <img src={mfaSetup.qrCode} alt="QR code de configuração" className="mx-auto w-40 h-40 rounded-lg border border-slate-200 dark:border-slate-700" />
            <p className="text-xs text-center text-slate-400 dark:text-slate-500 break-all">Ou digite manualmente: <span className="font-mono">{mfaSetup.secret}</span></p>
            <form onSubmit={handleConfirmMfaEnroll} className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="flex-1 text-center text-lg tracking-[0.4em] border border-slate-200 dark:border-slate-700 rounded-lg py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-slate-700 dark:text-slate-100"
              />
              <button type="submit" disabled={mfaBusy || mfaCode.length !== 6} className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-300 text-slate-900 font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors shrink-0">
                Confirmar
              </button>
            </form>
            <button onClick={() => { setMfaSetup(null); setMfaCode(''); }} className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600">Cancelar</button>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lock size={15} className="text-slate-400 dark:text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Alterar senha</h2>
        </div>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Nova senha</label>
            <input
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100"
              disabled={savingSenha}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Confirmar nova senha</label>
            <input
              type="password"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-700 dark:text-slate-100"
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
