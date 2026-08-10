// Bloqueio por biometria (Face ID / Touch ID / impressão digital) via WebAuthn.
// Isso NÃO substitui o login do Supabase — a sessão continua sendo a mesma,
// persistida normalmente. O que a biometria faz é travar a exibição do app
// neste dispositivo até a verificação local passar, algo como um cadeado de
// app (mesmo padrão de apps bancários que pedem Face ID para reabrir).

const STORAGE_KEY = 'biometric_credential_id';

export function biometricEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem(STORAGE_KEY);
}

export async function biometricAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function randomBytes(length: number): ArrayBuffer {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return arr.buffer as ArrayBuffer;
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
}

export async function enableBiometric(userId: string, userLabel: string): Promise<void> {
  const challenge = randomBytes(32);
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Controle Financeiro', id: window.location.hostname },
      user: { id: new TextEncoder().encode(userId), name: userLabel, displayName: userLabel },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000,
    },
  }) as PublicKeyCredential | null;
  if (!credential) throw new Error('Não foi possível registrar a biometria');
  localStorage.setItem(STORAGE_KEY, bufferToBase64(credential.rawId));
}

export function disableBiometric() {
  localStorage.removeItem(STORAGE_KEY);
}

export async function verifyBiometric(): Promise<boolean> {
  const credentialId = localStorage.getItem(STORAGE_KEY);
  if (!credentialId) return false;
  const challenge = randomBytes(32);
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: base64ToBuffer(credentialId), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}
