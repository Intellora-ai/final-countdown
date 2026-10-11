import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { api, modelConfig } from './server/api.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'LESSON_')
  return {
    plugins: [react(), { name: 'canvas-api', configureServer(server) {
      const config = modelConfig({ ...env, ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)) })
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) { next(); return }
        void api(req, res, config)
      })
    } }],
  }
})
