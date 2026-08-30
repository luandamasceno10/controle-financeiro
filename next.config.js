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
      '/api/cron/relatorio-mensal': ['./node_modules/pdfkit/js/standard-fonts/*'],
    },
  },
}

module.exports = nextConfig
