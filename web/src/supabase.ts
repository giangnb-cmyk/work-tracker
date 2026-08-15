// Supabase client — single entry point (replaces firebase.ts after cutover).
// The anon/publishable key is public by design; access is gated by RLS + Auth.

import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Kho phiên đăng nhập cho APP NATIVE (Capacitor). Mặc định supabase-js lưu vào
 * localStorage, nhưng localStorage của WKWebView (iOS) là vùng "transient" — máy đầy
 * bộ nhớ là OS xoá, user tự nhiên bị đăng xuất. @capacitor/preferences ghi vào
 * UserDefaults/SharedPreferences, không bao giờ bị dọn. Web vẫn dùng localStorage.
 */
const nativeSessionStorage = {
  getItem: async (key: string) => (await Preferences.get({ key })).value,
  setItem: async (key: string, value: string) => {
    await Preferences.set({ key, value });
  },
  removeItem: async (key: string) => {
    await Preferences.remove({ key });
  },
};

// Fail loud. Thiếu biến thì `createClient` cũng ném lỗi ngay sau đây và app trắng màn
// hình — nói rõ THIẾU CÁI GÌ và ĐẶT Ở ĐÂU, kèm cả Vercel: biến VITE_* được nhúng lúc
// BUILD, nên thêm biến trên Vercel xong phải redeploy mới ăn (không phải cứ set là xong).
if (!url || !anonKey) {
  const missing = [!url && 'VITE_SUPABASE_URL', !anonKey && 'VITE_SUPABASE_ANON_KEY']
    .filter(Boolean)
    .join(', ');
  throw new Error(
    `Thiếu cấu hình Supabase: ${missing}. ` +
      'Local: đặt trong web/.env.local. Production: Vercel → Project Settings → ' +
      'Environment Variables, rồi REDEPLOY (biến VITE_* nhúng lúc build).',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    ...(Capacitor.isNativePlatform() ? { storage: nativeSessionStorage } : {}),
  },
});

/** Optional company-domain restriction, e.g. "easygoing.vn". Empty = allow any Google account. */
export const ALLOWED_EMAIL_DOMAIN = (import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN || '').trim();
