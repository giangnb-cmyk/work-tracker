// Discord notify internals. Posts to a channel via a Discord webhook URL kept
// server-side. A webhook needs no bot token but can still ping users if the
// message contains <@id> and allowed_mentions lists those ids.

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

export const DISCORD_ENABLED = Boolean(WEBHOOK_URL);

export interface DonePayload {
  title: string;
  sprintName?: string;
  assigneeName?: string;
  url?: string; // link rút gọn tới task — tên task bấm được
  mentionIds?: string[]; // Discord user ids to ping
}

/** Thông báo task VỪA ĐƯỢC TẠO. Các dòng ngữ cảnh là tuỳ chọn — thiếu thì bỏ dòng đó. */
export interface CreatedPayload {
  event: 'created';
  title: string;
  creatorName?: string;
  assigneeName?: string;
  projectName?: string;
  featureName?: string;
  sprintName?: string;
  priorityLabel?: string;
  dueLabel?: string;
  url?: string;
  mentionIds?: string[]; // thường chỉ có người được giao
}

/**
 * Thông báo TICK XONG SUBTASK. `title` là tên TASK CHA (giữ đúng tên field mà handler
 * dùng để validate); subtask nằm ở `subtaskTitles`.
 *
 * Nhận MỘT MẢNG chứ không một tên: ô sửa subtask trong TaskModal lưu theo kiểu debounce,
 * tick liền 3 cái là gộp vào một lượt ghi — bắn 3 tin rời thì ngập kênh.
 */
export interface SubtaskDonePayload {
  event: 'subtask_done';
  title: string;
  subtaskTitles: string[];
  /** Tiến độ checklist SAU khi tick (3/5). Thiếu thì bỏ dòng đó. */
  doneCount?: number;
  totalCount?: number;
  /** Người vừa tick. */
  doerName?: string;
  sprintName?: string;
  url?: string;
  mentionIds?: string[];
}

/** Thông báo TÀI LIỆU MỚI vừa vào thư viện dự án (`project_docs`). Không ping ai —
 *  thêm tài liệu không nhắm vào một người cụ thể như giao task. */
export interface DocCreatedPayload {
  event: 'doc_created';
  /** Tên tài liệu (giữ tên field `title` để handler validate chung một chỗ). */
  title: string;
  url?: string;
  providerLabel?: string; // Google Drive / Figma / Notion…
  category?: string;
  description?: string;
  creatorName?: string;
  projectName?: string;
}

/**
 * CẢ BỐN loại tin đều là EMBED cùng khuôn (author = loại tin, title = tên bấm được, mỗi
 * thông tin một dòng giãn '\n\n') — phân biệt bằng MÀU VIỀN + header, không bằng format:
 * 🆕 task mới = indigo · ✅ task xong = xanh lá · ☑️ subtask xong = sky · 📚 tài liệu = vàng.
 * Màu lấy từ design system (--primary/--green/--sky/--gold).
 */
const CREATED_COLOR = 0x6366f1;
const DONE_COLOR = 0x22c55e;
const SUBTASK_COLOR = 0x38bdf8;
const DOC_COLOR = 0xfbbf24;

interface Embed {
  author?: { name: string };
  title?: string;
  url?: string;
  color?: number;
  description?: string;
}

/**
 * Dựng thông báo "task mới" dạng EMBED: tên task là TIÊU ĐỀ BẤM ĐƯỢC (link rút gọn), mỗi
 * thông tin một DÒNG trong description. Ping để ở `content` NGOÀI embed — mention trong embed
 * không báo. Cùng khuôn với bot (task_ops._notify_created) để web và bot trông giống nhau.
 */
function buildCreatedMessage(p: CreatedPayload): { content: string; embeds: Embed[]; users: string[] } {
  const users = (p.mentionIds ?? []).filter(Boolean);
  const lines = [
    `👤 **Người tạo:** ${p.creatorName || '—'}`,
    `🎯 **Giao cho:** ${p.assigneeName || 'chưa giao'}`,
    `⚡ **Ưu tiên:** ${p.priorityLabel || '—'}`,
    `📦 **Dự án:** ${p.projectName || '—'}`,
    `🧩 **Feature:** ${p.featureName || '—'}`,
    `🏃 **Sprint:** ${p.sprintName || 'Backlog'}`,
  ];
  if (p.dueLabel) lines.push(`📅 **Hạn:** ${p.dueLabel}`);

  const embed: Embed = {
    author: { name: '🆕 Task mới' },
    title: p.title,
    color: CREATED_COLOR,
    // '\n\n' (dòng trống xen giữa) cho thoáng — '\n' đơn thì các dòng sát nhau khó đọc.
    description: lines.join('\n\n'),
  };
  if (p.url) embed.url = p.url; // tên task bấm được → mở link rút gọn
  const content = users.length > 0 ? users.map((id) => `<@${id}>`).join(' ') : '';
  return { content, embeds: [embed], users };
}

/** Gửi 1 tin qua webhook, ping đúng các id trong `users`. Không bao giờ throw ra caller. */
async function postWebhook(content: string, users: string[], embeds?: Embed[]): Promise<boolean> {
  if (!DISCORD_ENABLED) return false;
  try {
    const body: Record<string, unknown> = {
      content,
      allowed_mentions: { parse: [], users }, // ping only the listed users
    };
    if (embeds && embeds.length > 0) body.embeds = embeds;
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch (err) {
    console.error('Gửi Discord webhook thất bại', err);
    return false;
  }
}

/**
 * "Task hoàn thành" — EMBED viền XANH LÁ, cùng khuôn với "task mới" (xem chú thích màu ở
 * trên). Ping nằm ở `content` NGOÀI embed — mention trong embed không báo. Cùng format
 * với bot (reminder.build_done_message) để web và bot báo giống nhau.
 */
function buildDoneMessage(p: DonePayload): { content: string; embeds: Embed[]; users: string[] } {
  const users = (p.mentionIds ?? []).filter(Boolean);
  const lines = [
    `🎯 **Người làm:** ${p.assigneeName || 'chưa giao'}`,
    `🏃 **Sprint:** ${p.sprintName || 'Backlog'}`,
  ];
  const embed: Embed = {
    author: { name: '✅ Task đã hoàn thành' },
    title: p.title,
    color: DONE_COLOR,
    description: lines.join('\n\n'),
  };
  if (p.url) embed.url = p.url;
  const content =
    users.length > 0 ? `Mọi người nắm thông tin nhé ${users.map((id) => `<@${id}>`).join(' ')}` : '';
  return { content, embeds: [embed], users };
}

/**
 * "Hoàn thành SubTask" — EMBED viền SKY, cùng khuôn với hai tin task (xem chú thích màu ở
 * trên): title = tên TASK CHA bấm được, các subtask vừa xong liệt kê trong description.
 * Tiêu đề cố định, không đếm số — tick liền mấy cái thì các dòng ☑️ đã liệt kê đủ.
 */
function buildSubtaskDoneMessage(p: SubtaskDonePayload): { content: string; embeds: Embed[]; users: string[] } {
  const users = (p.mentionIds ?? []).filter(Boolean);
  const items = p.subtaskTitles.filter(Boolean);
  const lines = [
    ...items.map((t) => `☑️ **${t}**`),
    `🎯 **Người làm:** ${p.doerName || '—'}`,
  ];
  if (p.totalCount) lines.push(`📊 **Tiến độ:** ${p.doneCount ?? 0}/${p.totalCount} subtask`);
  lines.push(`🏃 **Sprint:** ${p.sprintName || 'Backlog'}`);

  const embed: Embed = {
    author: { name: '☑️ Hoàn thành SubTask' },
    title: p.title,
    color: SUBTASK_COLOR,
    description: lines.join('\n\n'),
  };
  if (p.url) embed.url = p.url;
  const content = users.length > 0 ? users.map((id) => `<@${id}>`).join(' ') : '';
  return { content, embeds: [embed], users };
}

/** Send a completion message. Returns true on 2xx. Never throws to the caller. */
export async function postDone(p: DonePayload): Promise<boolean> {
  const { content, embeds, users } = buildDoneMessage(p);
  return postWebhook(content, users, embeds);
}

/** Send a "subtask ticked done" message. Returns true on 2xx. Never throws to the caller. */
export async function postSubtaskDone(p: SubtaskDonePayload): Promise<boolean> {
  const { content, embeds, users } = buildSubtaskDoneMessage(p);
  return postWebhook(content, users, embeds);
}

/** Send a "task created" message. Returns true on 2xx. Never throws to the caller. */
export async function postCreated(p: CreatedPayload): Promise<boolean> {
  const { content, embeds, users } = buildCreatedMessage(p);
  return postWebhook(content, users, embeds);
}

/**
 * Dựng thông báo "tài liệu mới" — EMBED cùng khuôn, viền VÀNG (xem chú thích màu ở trên)
 * và KHÔNG có dòng ping: tin chỉ để cả kênh biết thư viện vừa có gì, không réo ai cả.
 */
function buildDocCreatedMessage(p: DocCreatedPayload): Embed {
  const lines = [
    `👤 **Người thêm:** ${p.creatorName || '—'}`,
    `📦 **Dự án:** ${p.projectName || '—'}`,
    `🔖 **Nhóm:** ${p.category || '—'}`,
    `🌐 **Nguồn:** ${p.providerLabel || '—'}`,
  ];
  if (p.description) lines.push(`📝 ${p.description}`);
  const embed: Embed = {
    author: { name: '📚 Tài liệu mới trong thư viện' },
    title: p.title,
    color: DOC_COLOR,
    description: lines.join('\n\n'),
  };
  if (p.url) embed.url = p.url; // tên tài liệu bấm được → mở thẳng tài liệu
  return embed;
}

/** Send a "doc added to library" message. Returns true on 2xx. Never throws to the caller. */
export async function postDocCreated(p: DocCreatedPayload): Promise<boolean> {
  // content rỗng + embeds là hợp lệ với Discord (chỉ cần một trong hai có nội dung).
  return postWebhook('', [], [buildDocCreatedMessage(p)]);
}
