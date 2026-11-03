import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Front-end tests run against the page-level seam: a page rendered with a
 * services provider that hands it a fake API client and a fake scan event
 * source. Back-end tests stay on `node --test`, so they are excluded here.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
