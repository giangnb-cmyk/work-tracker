// POST /api/notify-discord — post a "task done" message to Discord, pinging the
// people involved. Used by the web when a task moves to `done`.
// Auth: Supabase access token (web) or x-sync-secret header (bot). See _auth.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authorize, projectWebhook } from './_auth.js';
import {
  FALLBACK_WEBHOOK_URL,
  postCreated,
  postDocCreated,
  postDone,
  postSubtaskDone,
  type CreatedPayload,
  type DocCreatedPayload,
  type DonePayload,
  type SubtaskDonePayload,
} from './_discord.js';

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-sync-secret');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await authorize(req.headers as Record<string, unknown>);
  if (!caller.ok) {
    // Xem ghi chú ở api/notion.ts: thiếu env server != token sai.
    if (caller.notConfigured) return res.status(503).json({ error: 'auth_not_configured' });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const payload = req.body as DonePayload | CreatedPayload | SubtaskDonePayload | DocCreatedPayload;
  if (!payload?.title) return res.status(400).json({ error: 'title required' });

  // MỖI DỰ ÁN MỘT KÊNH. Trước đây cả app bắn vào đúng một webhook env, nên task của dự án
  // mới rơi vào kênh của dự án cũ. Không có webhook riêng thì THÔI KHÔNG GỬI — im lặng còn
  // hơn gửi nhầm chỗ; chỉ payload không kèm projectId mới lùi về webhook env dùng chung.
  const auth = String(req.headers.authorization ?? '');
  const webhook = payload.projectId
    ? await projectWebhook(payload.projectId, auth)
    : FALLBACK_WEBHOOK_URL;
  if (!webhook) {
    return res.status(200).json({
      notified: false,
      reason: payload.projectId ? 'project_has_no_webhook' : 'discord_not_configured',
    });
  }

  // 'event' vắng mặt = payload "done" cũ (giữ tương thích ngược với client đang chạy).
  const event = 'event' in payload ? payload.event : undefined;
  const ok =
    event === 'created'
      ? await postCreated(webhook, payload as CreatedPayload)
      : event === 'subtask_done'
        ? await postSubtaskDone(webhook, payload as SubtaskDonePayload)
        : event === 'doc_created'
          ? await postDocCreated(webhook, payload as DocCreatedPayload)
          : await postDone(webhook, payload as DonePayload);
  return res.status(200).json({ notified: ok });
}
