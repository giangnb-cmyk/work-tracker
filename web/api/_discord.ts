// Discord notify internals. Posts to a channel via a Discord webhook URL kept
// server-side. A webhook needs no bot token but can still ping users if the
// message contains <@id> and allowed_mentions lists those ids.

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

export const DISCORD_ENABLED = Boolean(WEBHOOK_URL);

export interface DonePayload {
  title: string;
  sprintName?: string;
  assigneeName?: string;
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
 * Build the "task done" message; only ping ids that are present.
 *
 * Ba dòng: tiêu đề nhắc việc · task làm header '##' (kèm sprint) · dòng ping mọi người.
 * Cùng format với bot (reminder.build_done_message) để web và bot báo giống nhau.
 */
function buildContent(p: DonePayload): { content: string; users: string[] } {
  const users = (p.mentionIds ?? []).filter(Boolean);
  const mentions = users.map((id) => `<@${id}>`).join(' ');
  const sprint = p.sprintName ? ` (sprint ${p.sprintName})` : '';
  const lines = ['✅ Task đã hoàn thành:', `## ${p.title}${sprint}`];
  if (users.length > 0) lines.push(`Mọi người nắm thông tin nhé ${mentions}`);
  return { content: lines.join('\n'), users };
}

/** Indigo accent (#6366f1) của design system — dùng làm màu viền embed "task mới". */
const CREATED_COLOR = 0x6366f1;

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

/** Send a completion message. Returns true on 2xx. Never throws to the caller. */
export async function postDone(p: DonePayload): Promise<boolean> {
  const { content, users } = buildContent(p);
  return postWebhook(content, users);
}

/** Send a "task created" message. Returns true on 2xx. Never throws to the caller. */
export async function postCreated(p: CreatedPayload): Promise<boolean> {
  const { content, embeds, users } = buildCreatedMessage(p);
  return postWebhook(content, users, embeds);
}
