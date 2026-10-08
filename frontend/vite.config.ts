import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { api } from './server/api'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'LESSON_')
  return {
    plugins: [react(), { name: 'canvas-api', configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) { next(); return }
        void api(req, res, { url: process.env.LESSON_API_URL ?? env.LESSON_API_URL, model: process.env.LESSON_MODEL ?? env.LESSON_MODEL, key: process.env.LESSON_API_KEY ?? env.LESSON_API_KEY })
      })
    } }],
  }
})
