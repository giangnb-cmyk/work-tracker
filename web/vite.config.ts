import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { devApi } from './vite-dev-api';

// Nhãn build hiện dưới tên tài khoản (Sidebar): ngày build theo giờ VN + commit SHA ngắn
// Vercel cung cấp (VERCEL_GIT_COMMIT_SHA). Chạy local không có SHA → 'dev'. Tự sinh mỗi
// lần build nên không ai phải nhớ bump version tay.
const COMMIT = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'dev';
const BUILD_DAY = new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const APP_VERSION = `${BUILD_DAY} · ${COMMIT}`;

// Vite config for the SPA. Vercel runs `npm run build` and serves `dist/`.
// devApi() serves web/api/* during `npm run dev` (no need for `vercel dev`).
export default defineConfig({
  plugins: [react(), devApi()],
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
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
