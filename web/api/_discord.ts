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

/** Send a completion message. Returns true on 2xx. Never throws to the caller. */
export async function postDone(p: DonePayload): Promise<boolean> {
  if (!DISCORD_ENABLED) return false;
  const { content, users } = buildContent(p);
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
