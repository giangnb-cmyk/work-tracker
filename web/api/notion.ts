// POST /api/notion — the single Notion sync gateway used by both web and bot.
// Body: { action: 'create' | 'update', task: NotionTaskInput, notionPageId?: string }
// Auth: Firebase ID token (web) or x-sync-secret header (bot). See _auth.ts / _notion.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authorize } from './_auth';
import {
  buildProperties,
  DATABASE_ID,
  NOTION_ENABLED,
  notion,
  type NotionTaskInput,
} from './_notion';

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-sync-secret');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!NOTION_ENABLED || !notion) {
    // Notion not configured: report gracefully so callers degrade instead of erroring hard.
    return res.status(200).json({ synced: false, reason: 'notion_not_configured' });
  }

  const caller = await authorize(req.headers as Record<string, unknown>);
  if (!caller.ok) return res.status(401).json({ error: 'Unauthorized' });

  const { action, task, notionPageId } = req.body as {
    action?: string;
    task?: NotionTaskInput;
    notionPageId?: string;
  };

  try {
    if (action === 'create') {
      if (!task?.title) return res.status(400).json({ error: 'task.title required' });
      const page = await notion.pages.create({
        parent: { database_id: DATABASE_ID },
        properties: buildProperties(task, true) as never,
      });
      const url = 'url' in page ? (page as { url: string }).url : '';
      return res.status(200).json({ synced: true, notionPageId: page.id, notionUrl: url });
    }

    if (action === 'update') {
      if (!notionPageId) return res.status(400).json({ error: 'notionPageId required' });
      if (!task) return res.status(400).json({ error: 'task required' });
      await notion.pages.update({
        page_id: notionPageId,
        properties: buildProperties(task, false) as never,
      });
      return res.status(200).json({ synced: true, notionPageId });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('Notion sync failed', err);
    return res.status(502).json({ synced: false, error: 'notion_api_error' });
  }
}
