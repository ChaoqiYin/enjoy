import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // `acceptance/` is in the run for the fixture's own sake: it is a second
    // backend, and what it answers is worth holding to the rule it stands in
    // for (see `acceptance/web-fixture.test.ts`).
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'acceptance/**/*.test.ts',
    ],
  },
});
