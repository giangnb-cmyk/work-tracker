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

/**
 * Build the "task created" message. Header giống buildContent để web và bot báo đồng nhất;
 * các dòng ngữ cảnh chỉ hiện khi có dữ liệu.
 */
function buildCreatedContent(p: CreatedPayload): { content: string; users: string[] } {
  const users = (p.mentionIds ?? []).filter(Boolean);
  const lines = ['🆕 Task mới:', `## ${p.title}`];
  const who: string[] = [];
  if (p.creatorName) who.push(`Người tạo: ${p.creatorName}`);
  who.push(`Giao cho: ${p.assigneeName || 'chưa giao'}`);
  lines.push(who.join(' · '));
  const ctx: string[] = [];
  if (p.projectName) ctx.push(`Dự án ${p.projectName}`);
  if (p.sprintName) ctx.push(`Sprint ${p.sprintName}`);
  if (p.featureName) ctx.push(`Feature ${p.featureName}`);
  if (p.priorityLabel) ctx.push(`Ưu tiên ${p.priorityLabel}`);
  if (ctx.length) lines.push(ctx.join(' · '));
  if (p.dueLabel) lines.push(`Hạn: ${p.dueLabel}`);
  if (p.url) lines.push(p.url);
  if (users.length > 0) lines.push(users.map((id) => `<@${id}>`).join(' '));
  return { content: lines.join('\n'), users };
}

/** Gửi 1 tin qua webhook, ping đúng các id trong `users`. Không bao giờ throw ra caller. */
async function postWebhook(content: string, users: string[]): Promise<boolean> {
  if (!DISCORD_ENABLED) return false;
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        allowed_mentions: { parse: [], users }, // ping only the listed users
      }),
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
  const { content, users } = buildCreatedContent(p);
  return postWebhook(content, users);
}
