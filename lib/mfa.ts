import { supabase } from './supabase';

// Fino wrapper sobre supabase.auth.mfa — centraliza os nomes de método (a API
// nativa é meio verbosa) e mantém Perfil.tsx/MfaChallenge.tsx sem precisar
// conhecer os detalhes de "factor" vs "challenge" do protocolo AAL2.

export async function mfaStatus() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const totp = data.totp.find((f) => f.status === 'verified') || null;
  return { enrolled: !!totp, factorId: totp?.id ?? null };
}

export async function mfaNeedsChallenge(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return data.nextLevel === 'aal2' && data.currentLevel !== data.nextLevel;
}

export async function mfaEnroll() {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
  if (error) throw error;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function mfaConfirmEnroll(factorId: string, code: string) {
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError) throw challengeError;
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
  if (error) throw error;
}

export async function mfaUnenroll(factorId: string) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

export async function mfaVerifyLogin(factorId: string, code: string) {
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError) throw challengeError;
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
  if (error) throw error;
}
