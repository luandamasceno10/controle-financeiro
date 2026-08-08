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
        {/* Aplica o tema salvo antes do primeiro paint — evita o "flash" de tela
            clara no meio de um carregamento em dark mode. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try {
              var t = localStorage.getItem('theme');
              if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
              }
            } catch (e) {}`,
          }}
        />
      </head>
      <body className="bg-slate-50 dark:bg-slate-900">{children}</body>
    </html>
  )
}
