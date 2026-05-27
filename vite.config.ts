import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { ProxyOptions } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const proxy: Record<string, ProxyOptions> = {
    // Proxy Benzinga API calls to avoid CORS restrictions
    '/api/benzinga': {
      target: 'https://api.benzinga.com',
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api\/benzinga/, '/api/v2'),
    },
  }

  // Capital IQ proxy (optional, feature-flagged)
  if (env.VITE_ENABLE_CAPITAL_IQ === 'true') {
    proxy['/api/ciq'] = {
      target: env.VITE_CAPITAL_IQ_BASE_URL || 'https://api.capitaliq.com',
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api\/ciq/, ''),
      headers: {
        Authorization: `Bearer ${env.VITE_CAPITAL_IQ_API_KEY}`,
      },
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    server: { proxy },
  }
})
