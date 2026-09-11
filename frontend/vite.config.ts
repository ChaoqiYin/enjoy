import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'enjoy-dev-server',
      configureServer(server) {
        server.middlewares.use('/__enjoy_dev', (_request, response) => {
          response.setHeader('Content-Type', 'application/json');
          response.end(
            JSON.stringify({ root: server.config.root, pid: process.pid }),
          );
        });
      },
    },
  ],
});
