// Sign-in allowlist stored at app_config where id='access', managed by admins.
// Rule (see DATA_MODEL.md): both arrays empty = allow anyone (bootstrap so the
// first admin can get in and configure it).

import { supabase } from '../supabase';
import type { AccessConfig } from '../types';

const ACCESS_ID = 'access';
const EMPTY: AccessConfig = { emails: [], domains: [] };

const norm = {
  emails: (xs: string[]) => xs.map((e) => e.toLowerCase().trim()).filter(Boolean),
  domains: (xs: string[]) => xs.map((d) => d.toLowerCase().trim().replace(/^@/, '')).filter(Boolean),
};

export async function fetchAccessConfig(): Promise<AccessConfig> {
  const { data, error } = await supabase
    .from('app_config')
    .select('emails, domains')
    .eq('id', ACCESS_ID)
    .maybeSingle();
  if (error || !data) return EMPTY;
  return { emails: norm.emails(data.emails ?? []), domains: norm.domains(data.domains ?? []) };
}

export async function saveAccessConfig(config: AccessConfig): Promise<void> {
  const { error } = await supabase.from('app_config').upsert(
    { id: ACCESS_ID, emails: norm.emails(config.emails), domains: norm.domains(config.domains) },
    { onConflict: 'id' },
  );
  if (error) throw error;
}

/**
 * Whether an email may sign in. Order:
 *  1. If the allowlist has any entry, the email must match it.
 *  2. Else, if an env domain is set, the email must be on that domain.
 *  3. Else (nothing configured), allow — bootstrap for the first admin.
 */
export function isEmailAllowed(email: string, config: AccessConfig, envDomain: string): boolean {
  const e = email.toLowerCase().trim();
  if (!e) return false;
  const domain = e.split('@')[1] ?? '';

  const hasList = config.emails.length > 0 || config.domains.length > 0;
  if (hasList) return config.emails.includes(e) || config.domains.includes(domain);
  if (envDomain) return domain === envDomain.toLowerCase().replace(/^@/, '');
  return true;
}
