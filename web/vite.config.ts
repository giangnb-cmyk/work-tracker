import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { devApi } from './vite-dev-api';

// Vite config for the SPA. Vercel runs `npm run build` and serves `dist/`.
// devApi() serves web/api/* during `npm run dev` (no need for `vercel dev`).
export default defineConfig({
  plugins: [react(), devApi()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendors into their own long-cacheable chunks so the initial
        // app shell downloads/parses faster (Chart.js only loads with the dashboard).
        manualChunks: {
          supabase: ['@supabase/supabase-js'],
          charts: ['chart.js', 'react-chartjs-2'],
        },
      },
    },
  },
});
