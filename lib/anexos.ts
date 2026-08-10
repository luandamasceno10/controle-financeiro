import { supabase } from '@/lib/supabase';

export async function uploadAnexo(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'bin';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('comprovantes').upload(path, file);
  if (error) throw error;
  return path;
}

export async function removeAnexo(path: string) {
  await supabase.storage.from('comprovantes').remove([path]);
}

export async function getAnexoUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('comprovantes').createSignedUrl(path, 60);
  return data?.signedUrl ?? null;
}
