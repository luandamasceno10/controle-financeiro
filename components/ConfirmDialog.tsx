'use client';

import { X } from 'lucide-react';

export function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  danger = false,
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-slate-600 mb-6">{message}</p>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              danger
                ? 'bg-rose-500 hover:bg-rose-400 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-white'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
