import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    passWithNoTests: false,
    coverage: {
      provider: 'v8', include: ['src/**/*.{ts,tsx}', 'server/**/*.ts'],
      reporter: ['text', 'json-summary', ['cobertura', { projectRoot: fileURLToPath(new URL('..', import.meta.url)) }]], reportsDirectory: 'coverage',
    },
  },
})
