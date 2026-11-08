'use client';

import { supabase } from '@/lib/supabase';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

export default function AdminCleanup({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const deleteBugLancamento = async () => {
    if (!confirm('Deletar lançamento com "revolucao" na descrição? Essa ação não pode ser desfeita.')) return;

    setLoading(true);
    setMessage('');
    try {
      const { data: lancamentos, error: searchError } = await supabase
        .from('lancamentos')
        .select('id, descricao')
        .eq('user_id', userId)
        .ilike('descricao', '%revolucao%');

      if (searchError) throw searchError;

      if (!lancamentos || lancamentos.length === 0) {
        setMessage('❌ Nenhum lançamento com "revolucao" encontrado');
        return;
      }

      setMessage(`Encontrado(s) ${lancamentos.length} lançamento(s). Deletando...`);

      for (const lanc of lancamentos) {
        const { error: deleteError } = await supabase
          .from('lancamentos')
          .delete()
          .eq('id', lanc.id);

        if (deleteError) throw deleteError;
      }

      setMessage(`✅ ${lancamentos.length} lançamento(s) deletado(s) com sucesso!`);
    } catch (err: any) {
      setMessage(`❌ Erro: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={deleteBugLancamento}
        disabled={loading}
        className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
      >
        <Trash2 size={14} />
        {loading ? 'Deletando...' : 'Limpar Bug'}
      </button>
      {message && (
        <div className="mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs whitespace-nowrap">
          {message}
        </div>
      )}
    </div>
  );
}
