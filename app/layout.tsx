import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Controle Financeiro Pessoal',
  description: 'Dashboard financeiro pessoal com categorização de gastos',
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Controle Financeiro',
  },
  themeColor: '#10B981',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Controle Financeiro" />
        <meta name="theme-color" content="#10B981" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="bg-slate-50">{children}</body>
    </html>
  )
}
