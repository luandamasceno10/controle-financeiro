'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Lancamento, Fatura } from '@/lib/supabase';
import { X } from 'lucide-react';

interface ChangeFaturaModalProps {
  lancamento: Lancamento;
  faturas: Fatura[];
  onClose: () => void;
  onSaved: () => void;
}

export default function ChangeFaturaModal({ lancamento, faturas, onClose, onSaved }: ChangeFaturaModalProps) {
  const [selectedFaturaId, setSelectedFaturaId] = useState<number | null>(lancamento.fatura_id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!selectedFaturaId) {
      setError('Selecione uma fatura');
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from('lancamentos')
        .update({ fatura_id: selectedFaturaId })
        .eq('id', lancamento.id);

      if (updateError) throw updateError;
      onSaved();
      onClose();
    } catch (err: any) {
      setError('Erro ao atualizar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl p-6 w-96">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Mudar Fatura</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          {lancamento.descricao}
        </p>

        <select
          value={selectedFaturaId ?? ''}
          onChange={(e) => setSelectedFaturaId(Number(e.target.value) || null)}
          className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
        >
          <option value="">Selecione uma fatura...</option>
          {faturas.map(f => (
            <option key={f.id} value={f.id}>
              {f.competencia.split('-')[1]}/{f.competencia.split('-')[0]}
            </option>
          ))}
        </select>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-slate-800 dark:bg-slate-700 text-white rounded-lg hover:bg-slate-900 dark:hover:bg-slate-600 disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
