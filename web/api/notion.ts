// POST /api/notion — the single Notion sync gateway used by both web and bot.
// Body: { action: 'create' | 'update' | 'archive' | 'list-projects', task?: NotionTaskInput,
//         notionPageId?: string }
// Auth: Supabase access token (web) or x-sync-secret header (bot). See _auth.ts / _notion.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authorize } from './_auth';
import {
  buildProperties,
  DATABASE_ID,
  listProjects,
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
  if (!caller.ok) {
    // Thiếu env server != token sai. Trả 503 để log/Network tab chỉ thẳng vào cấu hình
    // Vercel thay vì để cả đội đi soi nhầm phía đăng nhập.
    if (caller.notConfigured) {
      return res.status(503).json({ error: 'auth_not_configured' });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { action, task, notionPageId } = req.body as {
    action?: string;
    task?: NotionTaskInput;
    notionPageId?: string;
  };

  try {
    if (action === 'list-projects') {
      return res.status(200).json({ projects: await listProjects() });
    }

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

    // Xoá task trong app -> dọn luôn trang Notion tương ứng.
    //
    // Notion API không xoá vĩnh viễn được: `archived: true` đẩy trang vào Trash, còn khôi
    // phục được 30 ngày — đúng thứ ta muốn cho một thao tác lỡ tay.
    //
    // CHỈ đụng ĐÚNG MỘT trang theo id do caller đưa (chính là `tasks.notion_page_id`).
    // Database Notion này là workspace dùng chung cả công ty: không bao giờ được suy ra
    // trang từ tên, không bao giờ quét hàng loạt.
    if (action === 'archive') {
      if (!notionPageId) return res.status(400).json({ error: 'notionPageId required' });
      await notion.pages.update({ page_id: notionPageId, archived: true });
      return res.status(200).json({ synced: true, notionPageId });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('Đồng bộ Notion thất bại', err);
    return res.status(502).json({ synced: false, error: 'notion_api_error' });
  }
}
