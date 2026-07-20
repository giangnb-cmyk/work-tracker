// Notion gateway internals — config, client, and property builders.
// Files prefixed with "_" are NOT treated as routes by Vercel.

import { Client } from '@notionhq/client';

export interface NotionSubtask {
  title: string;
  done: boolean;
}

export interface NotionTaskInput {
  title: string;
  status: string; // our enum: todo | in_progress | review | done
  priority?: string; // low | medium | high | urgent
  assigneeName?: string;
  assigneeNotionUserId?: string | null;
  notionProjectId?: string | null; // Notion Projects-DB page id for the relation
  dueStart?: string | null; // YYYY-MM-DD — work window start
  dueDate?: string | null; // YYYY-MM-DD — work window end / deadline
  description?: string;
  /** Checklist -> to-do block trong thân trang. undefined = không đụng tới. */
  subtasks?: NotionSubtask[];
}

const env = process.env;

export const NOTION_ENABLED = Boolean(env.NOTION_TOKEN && env.NOTION_DATABASE_ID);

export const notion = NOTION_ENABLED ? new Client({ auth: env.NOTION_TOKEN }) : null;

const PROP = {
  title: env.NOTION_PROP_TITLE || 'Name',
  status: env.NOTION_PROP_STATUS || 'Status',
  assignee: env.NOTION_PROP_ASSIGNEE || 'Assignee',
  priority: env.NOTION_PROP_PRIORITY || 'Priority',
  due: env.NOTION_PROP_DUE || 'Due',
  project: env.NOTION_PROP_PROJECT || 'Project',
  // Mô tả: TẮT mặc định (khác các prop trên). Notion DB nào cũng có sẵn cột Name/Status,
  // nhưng cột mô tả thì không — bật bừa mà DB thiếu cột là Notion trả 502 cho MỌI lần
  // sync. Đặt NOTION_PROP_DESCRIPTION = tên cột (rich_text) để bật.
  description: env.NOTION_PROP_DESCRIPTION || '',
};

// Notion column kinds vary per database; make them configurable.
const STATUS_TYPE = (env.NOTION_STATUS_TYPE || 'status') as 'status' | 'select';
const ASSIGNEE_TYPE = (env.NOTION_ASSIGNEE_TYPE || 'rich_text') as 'people' | 'rich_text';
const PRIORITY_ENABLED = env.NOTION_PROP_PRIORITY !== '';
const DUE_ENABLED = env.NOTION_PROP_DUE !== '';
const PROJECT_ENABLED = env.NOTION_PROP_PROJECT !== '';
// Ngược với các prop khác: description PHẢI được khai tên cột mới bật (mặc định rỗng).
const DESC_ENABLED = Boolean(PROP.description);
// Notion rich_text mỗi ô tối đa 2000 ký tự — cắt để không bị API từ chối cả lần sync.
const NOTION_TEXT_LIMIT = 2000;

function parseMap(raw: string | undefined, fallback: Record<string, string>) {
  if (!raw) return fallback;
  try {
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    console.warn('JSON map trong env không hợp lệ; dùng mặc định.');
    return fallback;
  }
}

const STATUS_MAP = parseMap(env.NOTION_STATUS_MAP, {
  todo: 'Todo',
  in_progress: 'In progress',
  review: 'Review',
  done: 'Done',
});

const PRIORITY_MAP = parseMap(env.NOTION_PRIORITY_MAP, {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
});

function statusProp(status: string) {
  const name = STATUS_MAP[status] ?? status;
  return STATUS_TYPE === 'status' ? { status: { name } } : { select: { name } };
}

function assigneeProp(input: NotionTaskInput) {
  if (ASSIGNEE_TYPE === 'people') {
    return input.assigneeNotionUserId
      ? { people: [{ id: input.assigneeNotionUserId }] }
      : { people: [] };
  }
  return { rich_text: [{ text: { content: input.assigneeName || '' } }] };
}

/** Build the Notion `properties` object for create/update from our task shape. */
export function buildProperties(input: NotionTaskInput) {
  const props: Record<string, unknown> = {};

  // Tên task đồng bộ ở CẢ create LẪN update (không còn phân biệt forCreate) — trước đây
  // chỉ set khi create nên đổi tên task xong thì trang Notion vẫn giữ tên cũ. Chỉ ghi khi
  // có tên: update lỡ gửi tên rỗng thì giữ nguyên tiêu đề cũ chứ không xoá trắng.
  if (input.title) props[PROP.title] = { title: [{ text: { content: input.title } }] };
  props[PROP.status] = statusProp(input.status);

  if (DESC_ENABLED && input.description !== undefined) {
    props[PROP.description] = {
      rich_text: input.description
        ? [{ text: { content: input.description.slice(0, NOTION_TEXT_LIMIT) } }]
        : [],
    };
  }

  if (input.assigneeName !== undefined || input.assigneeNotionUserId !== undefined) {
    props[PROP.assignee] = assigneeProp(input);
  }
  if (PRIORITY_ENABLED && input.priority) {
    props[PROP.priority] = { select: { name: PRIORITY_MAP[input.priority] ?? input.priority } };
  }
  if (DUE_ENABLED && (input.dueDate !== undefined || input.dueStart !== undefined)) {
    // start = window start (falls back to end for legacy single-date tasks);
    // end is ticked only when it differs from start (a real range).
    const start = input.dueStart ?? input.dueDate ?? null;
    const end = input.dueStart ? input.dueDate ?? null : null;
    props[PROP.due] = start
      ? { date: end && end !== start ? { start, end } : { start } }
      : { date: null };
  }
  if (PROJECT_ENABLED && input.notionProjectId !== undefined) {
    props[PROP.project] = input.notionProjectId
      ? { relation: [{ id: input.notionProjectId }] }
      : { relation: [] };
  }
  return props;
}

export const DATABASE_ID = env.NOTION_DATABASE_ID || '';
export const SYNC_SECRET = env.NOTION_SYNC_SECRET || '';
export const PROJECTS_DB_ID = env.NOTION_PROJECTS_DB_ID || '';

/** Mỗi subtask -> một to_do block (ô tick) trong thân trang. Bỏ subtask tên rỗng. */
function toDoBlocks(subtasks: NotionSubtask[]): unknown[] {
  return subtasks
    .filter((s) => s.title && s.title.trim())
    .map((s) => ({
      object: 'block',
      type: 'to_do',
      to_do: {
        rich_text: [{ type: 'text', text: { content: s.title.trim().slice(0, NOTION_TEXT_LIMIT) } }],
        checked: Boolean(s.done),
      },
    }));
}

/**
 * Đồng bộ checklist (subtasks) vào thân trang Notion dưới dạng to_do block.
 *
 * Cách làm: XOÁ mọi to_do block cũ trong trang rồi thêm lại đúng danh sách hiện tại —
 * app là nguồn sự thật của checklist. CỐ Ý chỉ đụng block loại 'to_do': đoạn văn, ảnh,
 * mọi thứ người ta tự thêm trong Notion đều giữ nguyên.
 *
 * Chỉ đọc TRANG ĐẦU children (tối đa 100 block). Task có >100 block trong thân trang là
 * cực hiếm ở đây; nếu có, phần dư không bị đụng — chấp nhận được, không nổ lỗi.
 */
export async function syncSubtaskBlocks(pageId: string, subtasks: NotionSubtask[]): Promise<void> {
  if (!notion) return;
  const existing = await notion.blocks.children.list({ block_id: pageId, page_size: 100 });
  const oldTodoIds = existing.results
    .filter((b) => (b as { type?: string }).type === 'to_do')
    .map((b) => (b as { id: string }).id);
  for (const id of oldTodoIds) {
    await notion.blocks.delete({ block_id: id });
  }
  const blocks = toDoBlocks(subtasks);
  if (blocks.length > 0) {
    await notion.blocks.children.append({ block_id: pageId, children: blocks as never });
  }
}

export interface NotionProject {
  id: string;
  name: string;
}

/** Pull the project pages' id + title from the Notion Projects DB (paginated). */
export async function listProjects(): Promise<NotionProject[]> {
  if (!notion || !PROJECTS_DB_ID) return [];
  const out: NotionProject[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.databases.query({
      database_id: PROJECTS_DB_ID,
      page_size: 100,
      start_cursor: cursor,
    });
    for (const page of res.results) {
      const props = (page as { properties?: Record<string, unknown> }).properties ?? {};
      const titleProp = Object.values(props).find(
        (p): p is { type: 'title'; title: { plain_text: string }[] } =>
          (p as { type?: string })?.type === 'title',
      );
      const name = (titleProp?.title ?? []).map((t) => t.plain_text).join('').trim();
      out.push({ id: (page as { id: string }).id, name: name || '(không tên)' });
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}
