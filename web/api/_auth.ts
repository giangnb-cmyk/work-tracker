// Server-side auth for the Notion gateway.
// Web callers present a Firebase ID token; the bot presents the shared secret.

import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { SYNC_SECRET } from './_notion';

let app: App | null = null;

/** Lazily init firebase-admin from the FIREBASE_SERVICE_ACCOUNT env (JSON string). */
function adminApp(): App | null {
  if (app) return app;
  if (getApps().length) {
    app = getApps()[0];
    return app;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.warn('FIREBASE_SERVICE_ACCOUNT not set — cannot verify web ID tokens.');
    return null;
  }
  const serviceAccount = JSON.parse(raw);
  app = initializeApp({ credential: cert(serviceAccount) });
  return app;
}

export interface Caller {
  ok: boolean;
  uid?: string;
  via: 'secret' | 'firebase' | 'none';
}

/** Returns whether the request is authorized (bot secret OR valid Firebase ID token). */
export async function authorize(headers: Record<string, unknown>): Promise<Caller> {
  const secret = String(headers['x-sync-secret'] ?? '');
  if (SYNC_SECRET && secret && secret === SYNC_SECRET) {
    return { ok: true, via: 'secret' };
  }

  const authHeader = String(headers['authorization'] ?? '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return { ok: false, via: 'none' };

  const a = adminApp();
  if (!a) return { ok: false, via: 'none' };
  try {
    const decoded = await getAuth(a).verifyIdToken(token);
    return { ok: true, uid: decoded.uid, via: 'firebase' };
  } catch (err) {
    console.error('ID token verification failed', err);
    return { ok: false, via: 'none' };
  }
}
