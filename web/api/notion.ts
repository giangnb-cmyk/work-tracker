// POST /api/notion — the single Notion sync gateway used by both web and bot.
// Body: { action: 'create' | 'update' | 'archive' | 'list-projects', task?: NotionTaskInput,
//         notionPageId?: string }
// Auth: Supabase access token (web) or x-sync-secret header (bot). See _auth.ts / _notion.ts.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authorize } from './_auth.js';
import {
  buildProperties,
  DATABASE_ID,
  listProjects,
  NOTION_ENABLED,
  notion,
  syncSubtaskBlocks,
  type NotionTaskInput,
} from './_notion.js';

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-sync-secret');
}

/**
 * Bọc TOÀN BỘ handler, không chừa dòng nào ra ngoài try.
 *
 * Trên Vercel, một throw lọt ra khỏi handler thành 500 của hạ tầng: body do Vercel sinh,
 * ta không chèn được gì vào, nên phía người dùng chỉ còn đúng con số 500 và phải đi mò log
 * Vercel mới biết chuyện gì. `authorize()` từng nằm ngoài try đúng kiểu đó.
 *
 * Ở đây thì khác: mọi lỗi đều thành một mã CÓ NGHĨA kèm `detail` để UI đọc thẳng ra —
 * và điều đó đúng ở cả local lẫn production, chứ không chỉ dưới `npm run dev`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return await route(req, res);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('Gateway Notion chết ngoài dự tính', err);
    if (res.writableEnded) return;
    return res.status(502).json({ synced: false, error: 'gateway_crash', detail });
  }
}

async function route(req: VercelRequest, res: VercelResponse) {
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

  // req.body có thể vắng (body rỗng / Content-Type lạ) — destructure thẳng là ném TypeError
  // ra ngoài, và trên Vercel nó thành 500 trắng.
  const { action, task, notionPageId } = (req.body ?? {}) as {
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
        properties: buildProperties(task) as never,
      });
      // Checklist -> to-do block trong thân trang, sau khi đã có page id.
      if (task.subtasks?.length) await syncSubtaskBlocks(page.id, task.subtasks);
      const url = 'url' in page ? (page as { url: string }).url : '';
      return res.status(200).json({ synced: true, notionPageId: page.id, notionUrl: url });
    }

    if (action === 'update') {
      if (!notionPageId) return res.status(400).json({ error: 'notionPageId required' });
      if (!task) return res.status(400).json({ error: 'task required' });
      await notion.pages.update({
        page_id: notionPageId,
        properties: buildProperties(task) as never,
      });
      // subtasks CÓ MẶT (kể cả mảng rỗng) = lần lưu này đổi checklist -> đồng bộ lại thân
      // trang. VẮNG = cập nhật status/… không đụng to-do.
      if (task.subtasks !== undefined) await syncSubtaskBlocks(notionPageId, task.subtasks);
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
    // Kèm message của Notion: "Priority is not a property that exists" nói thẳng phải đi
    // sửa cột nào, còn 'notion_api_error' trơ trọi thì buộc phải mở log Vercel mới biết —
    // mà chỉ admin mới vào được đó. Đây là API nội bộ sau cổng đăng nhập, không phải
    // endpoint công khai, nên lộ message của Notion là chấp nhận được.
    return res.status(502).json({
      synced: false,
      error: 'notion_api_error',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
