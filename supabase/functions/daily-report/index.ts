// POST /functions/v1/daily-report — báo cáo task hằng ngày (10:30 VN) vào webhook Discord
// của TỪNG project (projects.daily_report_webhook), tag người theo discord_id.
//
// Thay cho job Python self-host: chạy trong Supabase, gọi bởi pg_cron (migration 0048) nên
// không cần máy nào bật terminal. Đọc DB bằng service_role (auto-inject) — KHÔNG import
// supabase-js (tránh cold start), dùng raw fetch tới PostgREST như function member-tasks.
//
// Nội dung mỗi project:
//   🌙 Hôm qua đã hoàn thành (task done trong ngày làm việc trước, giờ VN)
//   ☀️ Hôm nay = task CHƯA xong trong sprint đang chạy (đánh dấu ⚠️ nếu quá hạn)
//
// verify_jwt = true: gateway Supabase chặn gọi ẩn danh; cron gọi kèm service_role key
// (lấy từ Vault). Đặt WEB_BASE_URL qua secret của function để link task trỏ về web.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEB_BASE_URL = (Deno.env.get('WEB_BASE_URL') ?? '').trim().replace(/\/+$/, '');

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;

interface Task {
  id: string;
  title: string | null;
  assignee_id: string | null;
  project_id: string | null;
  due_date: string | null;
}
interface Profile {
  id: string;
  display_name: string | null;
  discord_id: string | null;
}

/** GET tới PostgREST bằng service key. Trả mảng rows. */
async function pg<T>(pathAndQuery: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`PostgREST ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as T[];
}

// --- Ngày giờ VN (UTC+7, không DST) ---
function vnParts(d: Date) {
  const v = new Date(d.getTime() + VN_OFFSET_MS); // đọc bằng getUTC* = giờ treo tường VN
  return { y: v.getUTCFullYear(), mo: v.getUTCMonth(), da: v.getUTCDate(), wd: v.getUTCDay() };
}
/** yyyymmdd (số) để so ngày. */
function dayNum(y: number, mo: number, da: number): number {
  return y * 10000 + (mo + 1) * 100 + da;
}
/** Mốc UTC ứng với 00:00 giờ VN của ngày (y,mo,da). */
function vnMidnightUtc(y: number, mo: number, da: number): Date {
  return new Date(Date.UTC(y, mo, da) - VN_OFFSET_MS);
}
function ddmm(y: number, mo: number, da: number): string {
  return `${String(da).padStart(2, '0')}/${String(mo + 1).padStart(2, '0')}`;
}

// --- Hiển thị ---
function mention(p: Profile | undefined): string {
  if (p && (p.discord_id ?? '').trim()) return `<@${p.discord_id}>`;
  if (p && (p.display_name ?? '').trim()) return p.display_name as string;
  return 'Người dùng';
}
function taskUrl(id: string): string {
  return WEB_BASE_URL ? `${WEB_BASE_URL}/tasks/${id}` : '';
}
function dueVnNum(iso: string | null): number | null {
  if (!iso) return null;
  const p = vnParts(new Date(iso));
  return dayNum(p.y, p.mo, p.da);
}

function groupByAssignee(tasks: Task[]): Map<string | null, Task[]> {
  const g = new Map<string | null, Task[]>();
  for (const t of tasks) {
    const k = t.assignee_id;
    (g.get(k) ?? g.set(k, []).get(k)!).push(t);
  }
  return g;
}

function renderSection(
  icon: string,
  title: string,
  tasks: Task[],
  profiles: Map<string, Profile>,
  todayNum: number | null,
): string {
  let msg = `\n${icon} **${title}**\n`;
  if (tasks.length === 0) return msg + '_Không có task nào_\n';

  for (const [assigneeId, items] of groupByAssignee(tasks)) {
    const who = assigneeId ? mention(profiles.get(assigneeId)) : 'Chưa giao';
    msg += `\n👤 **${who}: ${items.length} task**\n`;
    for (const t of items) {
      const titleTxt = t.title || '(không tên)';
      const url = taskUrl(t.id);
      let line = url ? `[${titleTxt}](${url})` : titleTxt;
      if (todayNum !== null) {
        const dn = dueVnNum(t.due_date);
        if (dn !== null && dn < todayNum) {
          const dd = new Date(t.due_date as string);
          const p = vnParts(dd);
          line += ` ⚠️ quá hạn ${ddmm(p.y, p.mo, p.da)}`;
        }
      }
      msg += `- ${line}\n`;
    }
  }
  return msg;
}

/** Cắt theo dòng để không vượt 2000 ký tự Discord. */
function chunk(message: string, size = 1900): string[] {
  const parts: string[] = [];
  let buf = '';
  for (const line of message.split(/(?<=\n)/)) {
    if (buf.length + line.length > size) {
      if (buf) parts.push(buf);
      buf = line;
    } else {
      buf += line;
    }
  }
  if (buf) parts.push(buf);
  return parts;
}

async function postWebhook(webhook: string, message: string): Promise<number> {
  let sent = 0;
  for (const part of chunk(message)) {
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // parse:['users'] -> ping <@id> trong nội dung, nhưng chặn @everyone/role.
        body: JSON.stringify({ content: part, allowed_mentions: { parse: ['users'] } }),
      });
      if (res.ok) sent++;
      else console.error(`LOI: webhook trả ${res.status}: ${(await res.text()).slice(0, 200)}`);
      await new Promise((r) => setTimeout(r, 400)); // né rate limit
    } catch (e) {
      console.error('LOI: gửi webhook thất bại:', (e as Error).message);
    }
  }
  return sent;
}

Deno.serve(async () => {
  try {
    const now = new Date();
    const t = vnParts(now);
    const todayNum = dayNum(t.y, t.mo, t.da);
    // Ngày làm việc trước: thứ 2 (wd=1) lùi 3 ngày về thứ 6, còn lại lùi 1.
    const prev = new Date(Date.UTC(t.y, t.mo, t.da) - (t.wd === 1 ? 3 : 1) * DAY_MS);
    const yv = { y: prev.getUTCFullYear(), mo: prev.getUTCMonth(), da: prev.getUTCDate() };

    const [sprints, projectsRaw, profilesRaw] = await Promise.all([
      pg<{ id: string; name: string }>('sprints?status=eq.active&select=id,name&limit=1'),
      pg<{ id: string; name: string; daily_report_webhook: string | null }>(
        'projects?select=id,name,daily_report_webhook',
      ),
      pg<Profile>('profiles?select=id,display_name,discord_id'),
    ]);

    const sprint = sprints[0] ?? null;
    const projects = projectsRaw.filter((p) => (p.daily_report_webhook ?? '').trim());
    const profiles = new Map(profilesRaw.map((p) => [p.id, p]));

    if (projects.length === 0) {
      return json({ ok: true, note: 'Không project nào cấu hình webhook.', sent: 0 });
    }

    // Task chưa xong trong sprint active (mọi project)
    const openTasks = sprint
      ? await pg<Task>(
          `tasks?sprint_id=eq.${sprint.id}&status=neq.done&select=id,title,assignee_id,project_id,due_date`,
        )
      : [];
    // Task done "hôm qua" theo due_date (khi done, due_date = ngày xong), khoảng giờ VN
    const startIso = vnMidnightUtc(yv.y, yv.mo, yv.da).toISOString();
    const endIso = vnMidnightUtc(t.y, t.mo, t.da).toISOString();
    const doneTasks = await pg<Task>(
      `tasks?status=eq.done&due_date=gte.${startIso}&due_date=lt.${endIso}` +
        `&select=id,title,assignee_id,project_id,due_date`,
    );

    const openByPrj = new Map<string, Task[]>();
    for (const tk of openTasks) if (tk.project_id) push(openByPrj, tk.project_id, tk);
    const doneByPrj = new Map<string, Task[]>();
    for (const tk of doneTasks) if (tk.project_id) push(doneByPrj, tk.project_id, tk);

    const yLabel = ddmm(yv.y, yv.mo, yv.da);
    const tLabel = ddmm(t.y, t.mo, t.da);
    const sprintPart = sprint ? ` · Sprint ${sprint.name}` : '';

    const results: { project: string; sent: number }[] = [];
    for (const prj of projects) {
      let msg = `\n# 📢 **DAILY REPORT: ${prj.name.toUpperCase()}**\n`;
      msg += renderSection('🌙', `TASK HÔM QUA (ĐÃ HOÀN THÀNH) — ${yLabel}`, doneByPrj.get(prj.id) ?? [], profiles, null);
      msg += '\n─────────────────────────────\n';
      msg += renderSection('☀️', `TASK HÔM NAY (CHƯA XONG${sprintPart}) — ${tLabel}`, openByPrj.get(prj.id) ?? [], profiles, todayNum);
      const sent = await postWebhook((prj.daily_report_webhook as string).trim(), msg);
      results.push({ project: prj.name, sent });
    }

    return json({ ok: true, activeSprint: sprint?.name ?? null, projects: results });
  } catch (err) {
    console.error('LOI: daily-report thất bại:', (err as Error).message);
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});

function push<T>(m: Map<string, T[]>, k: string, v: T): void {
  (m.get(k) ?? m.set(k, []).get(k)!).push(v);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
