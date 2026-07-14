// Sign-in allowlist stored at config/access, managed by admins.
// Rule (see DATA_MODEL.md): both arrays empty = allow anyone (bootstrap so the
// first admin can get in and configure it).

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { AccessConfig } from '../types';

const ACCESS_DOC = ['config', 'access'] as const;

const EMPTY: AccessConfig = { emails: [], domains: [] };

export async function fetchAccessConfig(): Promise<AccessConfig> {
  try {
    const snap = await getDoc(doc(db, ...ACCESS_DOC));
    if (!snap.exists()) return EMPTY;
    const data = snap.data() as Partial<AccessConfig>;
    return {
      emails: (data.emails ?? []).map((e) => e.toLowerCase().trim()).filter(Boolean),
      domains: (data.domains ?? []).map((d) => d.toLowerCase().trim().replace(/^@/, '')).filter(Boolean),
    };
  } catch (err) {
    console.error('fetchAccessConfig failed', err);
    return EMPTY;
  }
}

export function saveAccessConfig(config: AccessConfig): Promise<void> {
  return setDoc(doc(db, ...ACCESS_DOC), {
    emails: config.emails.map((e) => e.toLowerCase().trim()).filter(Boolean),
    domains: config.domains.map((d) => d.toLowerCase().trim().replace(/^@/, '')).filter(Boolean),
  });
}

/**
 * Whether an email may sign in. Order:
 *  1. If the Firestore allowlist has any entry, the email must match it.
 *  2. Else, if an env domain is set, the email must be on that domain.
 *  3. Else (nothing configured), allow — bootstrap for the first admin.
 */
export function isEmailAllowed(
  email: string,
  config: AccessConfig,
  envDomain: string,
): boolean {
  const e = email.toLowerCase().trim();
  if (!e) return false;
  const domain = e.split('@')[1] ?? '';

  const hasList = config.emails.length > 0 || config.domains.length > 0;
  if (hasList) {
    return config.emails.includes(e) || config.domains.includes(domain);
  }
  if (envDomain) return domain === envDomain.toLowerCase().replace(/^@/, '');
  return true;
}
