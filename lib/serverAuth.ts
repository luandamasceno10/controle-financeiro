import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Valida o token de sessão do Supabase enviado pelo cliente via header
// Authorization — usado nas rotas de API que chamam a Anthropic, para
// impedir que alguém de fora da sessão logada consuma a cota da IA.
export async function getAuthedUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}
