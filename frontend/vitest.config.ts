import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    passWithNoTests: false,
    coverage: {
      provider: 'v8', include: ['src/**/*.{ts,tsx}', 'server/**/*.ts'],
      reporter: ['text', 'json-summary'], reportsDirectory: 'coverage',
    },
  },
})
