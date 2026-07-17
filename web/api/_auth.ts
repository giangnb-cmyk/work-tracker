// Server-side auth for the Notion/Discord gateways.
// Web callers present a Supabase access token (JWT); the bot presents the shared secret.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SYNC_SECRET } from './_notion.js';

const env = process.env;

let client: SupabaseClient | null = null;

/**
 * Lazily build a Supabase client used only to validate incoming JWTs.
 *
 * CỐ Ý chỉ nhận ANON KEY. `auth.getUser(token)` chỉ cần anon key là đủ, nên trước đây có
 * fallback sang SUPABASE_SERVICE_ROLE_KEY là thừa — và tệ hơn, nó ngầm mời người ta đặt
 * service-role key vào env của Vercel, đúng thứ CLAUDE.md cấm: key đó bypass toàn bộ RLS
 * và chỉ được nằm ở bot self-host. Đừng thêm lại fallback đó.
 */
function supabaseAuthClient(): SupabaseClient | null {
  if (client) return client;
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn('Chưa đặt SUPABASE_URL / SUPABASE_ANON_KEY — không thể xác thực token web.');
    return null;
  }
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export interface Caller {
  ok: boolean;
  uid?: string;
  via: 'secret' | 'supabase' | 'none';
  /**
   * true = server CHƯA CẤU HÌNH (thiếu SUPABASE_URL/ANON_KEY trên Vercel), khác hẳn
   * "token sai". Không tách ra thì quên set env trên Vercel sẽ hiện thành 401 và cả đội
   * đi soi nhầm phía đăng nhập, trong khi lỗi nằm ở Project Settings.
   */
  notConfigured?: boolean;
}

/** Returns whether the request is authorized (bot secret OR valid Supabase JWT). */
export async function authorize(headers: Record<string, unknown>): Promise<Caller> {
  const secret = String(headers['x-sync-secret'] ?? '');
  if (SYNC_SECRET && secret && secret === SYNC_SECRET) {
    return { ok: true, via: 'secret' };
  }

  const authHeader = String(headers['authorization'] ?? '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return { ok: false, via: 'none' };

  const sb = supabaseAuthClient();
  if (!sb) return { ok: false, via: 'none', notConfigured: true };
  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return { ok: false, via: 'none' };
    return { ok: true, uid: data.user.id, via: 'supabase' };
  } catch (err) {
    console.error('Xác thực token Supabase thất bại', err);
    return { ok: false, via: 'none' };
  }
}
