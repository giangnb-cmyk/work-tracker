/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALLOWED_EMAIL_DOMAIN?: string;
  /** Base URL của web để dựng link chia sẻ tuyệt đối (vd link task /t/<mã>). Bỏ trống = mặc định trong code. */
  readonly VITE_APP_URL?: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Nhãn build (ngày build giờ VN + commit SHA ngắn) — Vite `define` nhét vào lúc build,
 * xem vite.config.ts. Hiện dưới tên tài khoản ở Sidebar để biết đang chạy bản nào.
 */
declare const __APP_VERSION__: string;
