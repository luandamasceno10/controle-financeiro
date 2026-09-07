/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @react-pdf/renderer usa o pdfkit por baixo dos panos, que carrega os
  // arquivos de fonte padrão via require() dinâmico — o tracing automático
  // da Vercel não detecta esse padrão e deixa os .cjs de fora do pacote da
  // função serverless, quebrando a geração do PDF em produção (funciona
  // local porque lê direto do node_modules do disco).
  experimental: {
    outputFileTracingIncludes: {
      '/api/cron/relatorio-mensal': ['./node_modules/pdfkit/js/standard-fonts/**/*'],
    },
  },
  // Sem isso, o HTML de cada página pode ficar em cache no navegador (ou numa
  // CDN) mesmo depois de um novo deploy — daí o app continuar rodando um bundle
  // JS antigo indefinidamente, porque a própria página que referencia os
  // arquivos com hash nunca foi buscada de novo. Já causou confusão real:
  // várias correções seguidas de um bug pareciam não fazer efeito nenhum.
  async headers() {
    return [
      {
        // Só as páginas em si — os arquivos com hash em /_next/static (JS, CSS)
        // continuam com cache normal, já que o próprio hash muda a cada deploy
        // e não tem risco de ficar desatualizado.
        source: '/:path((?!_next/static|_next/image).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
}

module.exports = nextConfig
