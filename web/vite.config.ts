import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for the SPA. Vercel runs `npm run build` and serves `dist/`.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
