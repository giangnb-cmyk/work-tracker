// Server-side auth for the Notion/Discord gateways.
// Web callers present a Supabase access token (JWT); the bot presents the shared secret.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SYNC_SECRET } from './_notion';

const env = process.env;

let client: SupabaseClient | null = null;

/** Lazily build a Supabase client used only to validate incoming JWTs. */
function supabaseAuthClient(): SupabaseClient | null {
  if (client) return client;
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
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
  if (!sb) return { ok: false, via: 'none' };
  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return { ok: false, via: 'none' };
    return { ok: true, uid: data.user.id, via: 'supabase' };
  } catch (err) {
    console.error('Xác thực token Supabase thất bại', err);
    return { ok: false, via: 'none' };
  }
}
