import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Controle Financeiro Pessoal',
  description: 'Dashboard financeiro pessoal com categorização de gastos',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-slate-50">{children}</body>
    </html>
  )
}
