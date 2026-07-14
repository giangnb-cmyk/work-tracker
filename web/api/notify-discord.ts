// POST /api/notify-discord — post a "task done" message to Discord, pinging the
// people involved. Used by the web when a task moves to `done`.
// Auth: Firebase ID token (web) or x-sync-secret header (bot). See _auth.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authorize } from './_auth';
import { DISCORD_ENABLED, postDone, type DonePayload } from './_discord';

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-sync-secret');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!DISCORD_ENABLED) {
    return res.status(200).json({ notified: false, reason: 'discord_not_configured' });
  }

  const caller = await authorize(req.headers as Record<string, unknown>);
  if (!caller.ok) return res.status(401).json({ error: 'Unauthorized' });

  const payload = req.body as DonePayload;
  if (!payload?.title) return res.status(400).json({ error: 'title required' });

  const ok = await postDone(payload);
  return res.status(200).json({ notified: ok });
}
