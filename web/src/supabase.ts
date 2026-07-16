// Supabase client — single entry point (replaces firebase.ts after cutover).
// The anon/publishable key is public by design; access is gated by RLS + Auth.

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fail loud in dev so we don't get cryptic runtime errors later.
if (!url || !anonKey) {
  console.error(
    'Thiếu cấu hình Supabase. Đặt VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trong web/.env.local.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Optional company-domain restriction, e.g. "easygoing.vn". Empty = allow any Google account. */
export const ALLOWED_EMAIL_DOMAIN = (import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN || '').trim();
