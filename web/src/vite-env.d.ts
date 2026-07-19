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
