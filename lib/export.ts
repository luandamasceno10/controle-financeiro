import type { Lancamento } from '@/lib/supabase';

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR');
}

function csvEscape(value: string) {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportLancamentosCSV(entries: Lancamento[], filename: string) {
  const header = ['Data', 'Hora', 'Descrição', 'Categoria', 'Tipo', 'Forma de pagamento', 'Valor'];
  const rows = entries.map((e) => [
    fmtDate(e.data),
    e.hora ? e.hora.slice(0, 5) : '',
    e.descricao,
    e.categoria,
    e.tipo === 'entrada' ? 'Entrada' : 'Saída',
    e.forma_pagamento === 'pix' ? 'Pix' : 'Cartão',
    e.valor.toFixed(2).replace('.', ','),
  ]);

  const csv = [header, ...rows].map((row) => row.map((cell) => csvEscape(String(cell))).join(';')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportLancamentosPDF(entries: Lancamento[], titulo: string) {
  const entrada = entries.filter((e) => e.tipo === 'entrada').reduce((s, e) => s + Number(e.valor), 0);
  const saida = entries.filter((e) => e.tipo === 'saida').reduce((s, e) => s + Number(e.valor), 0);

  const rows = entries.map((e) => `
    <tr>
      <td>${fmtDate(e.data)}</td>
      <td>${e.descricao}</td>
      <td>${e.categoria}</td>
      <td>${e.tipo === 'entrada' ? 'Entrada' : 'Saída'}</td>
      <td>${e.forma_pagamento === 'pix' ? 'Pix' : 'Cartão'}</td>
      <td style="text-align:right; color:${e.tipo === 'entrada' ? '#059669' : '#1e293b'}">${e.tipo === 'entrada' ? '+' : '-'}${currency(Number(e.valor))}</td>
    </tr>
  `).join('');

  const html = `
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${titulo}</title>
      <style>
        body { font-family: -apple-system, Arial, sans-serif; color: #1e293b; padding: 32px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        p.subtitle { color: #64748b; font-size: 12px; margin-top: 0; margin-bottom: 24px; }
        .summary { display: flex; gap: 24px; margin-bottom: 24px; }
        .summary div { font-size: 12px; color: #64748b; }
        .summary strong { display: block; font-size: 16px; color: #1e293b; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { text-align: left; border-bottom: 2px solid #e2e8f0; padding: 8px 6px; color: #64748b; font-weight: 600; }
        td { border-bottom: 1px solid #f1f5f9; padding: 7px 6px; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>${titulo}</h1>
      <p class="subtitle">Extrato gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
      <div class="summary">
        <div>Entradas<strong style="color:#059669">${currency(entrada)}</strong></div>
        <div>Saídas<strong style="color:#e11d48">${currency(saida)}</strong></div>
        <div>Saldo<strong>${currency(entrada - saida)}</strong></div>
      </div>
      <table>
        <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th>Pagamento</th><th style="text-align:right">Valor</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <script>window.onload = () => window.print();</script>
    </body>
    </html>
  `;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
