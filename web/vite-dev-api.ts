// Dev-only plugin: serve the Vercel serverless functions in `web/api/*` during
// `npm run dev`, so /api/notion etc. work locally without `vercel dev`.
// It loads server env from .env (not just VITE_ vars) and runs each handler
// through Vite's SSR module loader, shimming the Vercel req/res surface.

import type { Plugin } from 'vite';
import { loadEnv } from 'vite';

// Only these route files are reachable (files prefixed with "_" are internal).
const ROUTES = new Set(['notion', 'notify-discord']);

export function devApi(): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      // Load ALL env (no prefix filter) into process.env for the handlers.
      const env = loadEnv(server.config.mode, server.config.root, '');
      for (const [k, v] of Object.entries(env)) {
        if (process.env[k] === undefined) process.env[k] = v;
      }

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();

        const url = new URL(req.url, 'http://localhost');
        const name = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
        if (!ROUTES.has(name)) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'unknown api route' }));
          return;
        }

        try {
          // Read + JSON-parse the request body (handlers expect req.body).
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const raw = Buffer.concat(chunks).toString('utf8');
          let body: unknown;
          if (raw) {
            try {
              body = JSON.parse(raw);
            } catch {
              body = raw;
            }
          }

          // Shim the small slice of the Vercel res API the handlers use.
          const anyRes = res as unknown as {
            status: (c: number) => typeof anyRes;
            json: (o: unknown) => typeof anyRes;
            end: (...a: unknown[]) => void;
          };
          anyRes.status = (code: number) => {
            res.statusCode = code;
            return anyRes;
          };
          anyRes.json = (obj: unknown) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(obj));
            return anyRes;
          };

          const vercelReq = Object.assign(req, {
            body,
            query: Object.fromEntries(url.searchParams),
            cookies: {},
          });

          const mod = await server.ssrLoadModule(`/api/${name}.ts`);
          await (mod.default as (rq: unknown, rs: unknown) => unknown)(vercelReq, res);
        } catch (err) {
          // Handler chết NGOÀI try/catch của chính nó (lỗi lúc load module, hoặc throw
          // trước khối try). Các gateway đều tự trả mã có nghĩa (401/502/503) cho lỗi
          // chúng lường trước, nên 500 ở đây LUÔN là sự cố ngoài dự tính.
          //
          // Trả kèm message + stack: đây là plugin `apply: 'serve'`, không bao giờ chạy
          // trên production, mà "dev api handler error" trơ trọi thì phải mò log terminal
          // mới biết chuyện gì — trong khi người bấm nút chỉ nhìn thấy tab Network.
          const detail = err instanceof Error ? err.message : String(err);
          server.config.logger.error(`[dev-api] ${name} chết: ${detail}`);
          if (err instanceof Error && err.stack) server.config.logger.error(err.stack);
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'dev api handler error', detail }));
          }
        }
      });
    },
  };
}
