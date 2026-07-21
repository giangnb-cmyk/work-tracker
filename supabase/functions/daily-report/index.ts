// POST /functions/v1/daily-report — báo cáo task hằng ngày vào webhook Discord của TỪNG
// project (projects.daily_report_webhook), tag người theo discord_id.
//
// Hai chế độ:
//  • CRON (body rỗng): gọi bởi pg_cron 10:30 VN (migration 0048), quét MỌI project có webhook.
//  • TEST (body {projectId, webhook?}): admin bấm "Gửi thử" trong web → gửi report của ĐÚNG
//    project đó (nhãn 🧪 TEST) vào webhook truyền lên (hoặc webhook đã lưu). Gate = admin.
//
// Báo cáo CHỈ task của SPRINT ĐANG CHẠY (sprint tuần này = sprint có [start,end] phủ hôm
// nay, giống activeSprintAt của web — KHÔNG theo cột status). Nội dung mỗi project:
//  🌙 Hôm qua đã hoàn thành (task trong sprint, done ngày làm việc trước).
//  ☀️ Hôm nay cần làm = task CHƯA xong TRONG SPRINT (⚠️ đánh dấu quá hạn).
// Mỗi task là link Discord [tiêu đề](WEB_BASE_URL/tasks/<id>) — LINK WEB, không dùng Notion.
// Tin dài > 2000 ký tự (giới hạn Discord) được cắt theo dòng thành nhiều tin (hàm chunk).
//
// Chạy trong Supabase (không cần máy self-host). Đọc DB bằng service_role (auto-inject),
// dùng raw fetch tới PostgREST (không import supabase-js — tránh cold start).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Mặc định về domain đã deploy để link web luôn bấm được kể cả khi chưa đặt secret WEB_BASE_URL.
const WEB_BASE_URL = (Deno.env.get('WEB_BASE_URL') || 'https://work-tracker-zeta-two.vercel.app')
  .trim().replace(/\/+$/, '');

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // supabase-js functions.invoke gửi kèm x-client-info -> phải cho phép, không thì preflight chặn.
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TASK_FIELDS = 'id,title,assignee_id,project_id,due_date';

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
function dayNum(y: number, mo: number, da: number): number {
  return y * 10000 + (mo + 1) * 100 + da;
}
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
/** Link mở task = trang task trên web (/tasks/<id>). KHÔNG dùng notion_url theo yêu cầu. */
function taskLink(t: Task): string {
  return WEB_BASE_URL ? `${WEB_BASE_URL}/tasks/${t.id}` : '';
}
function dueVnNum(iso: string | null): number | null {
  if (!iso) return null;
  const p = vnParts(new Date(iso));
  return dayNum(p.y, p.mo, p.da);
}

function groupByAssignee(tasks: Task[]): Map<string | null, Task[]> {
  const g = new Map<string | null, Task[]>();
  for (const t of tasks) push(g, t.assignee_id, t);
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
      const url = taskLink(t);
      let line = url ? `[${titleTxt}](${url})` : titleTxt;
      if (todayNum !== null) {
        const dn = dueVnNum(t.due_date);
        if (dn !== null && dn < todayNum) {
          const p = vnParts(new Date(t.due_date as string));
          line += ` ⚠️ quá hạn ${ddmm(p.y, p.mo, p.da)}`;
        }
      }
      msg += `- ${line}\n`;
    }
  }
  return msg;
}

function buildMessage(
  prjName: string,
  sprintName: string | null,
  done: Task[],
  open: Task[],
  profiles: Map<string, Profile>,
  yLabel: string,
  tLabel: string,
  todayNum: number,
  test: boolean,
): string {
  const tag = test ? '🧪 (TEST) ' : '';
  const sp = sprintName ? ` · ${sprintName}` : '';
  let msg = `\n# 📢 **${tag}DAILY REPORT: ${prjName.toUpperCase()}**${sp}\n`;
  msg += renderSection('🌙', `TASK HÔM QUA (ĐÃ HOÀN THÀNH) — ${yLabel}`, done, profiles, null);
  msg += '\n─────────────────────────────\n';
  msg += renderSection('☀️', `TASK HÔM NAY (CHƯA XONG) — ${tLabel}`, open, profiles, todayNum);
  if (!sprintName) msg += '\n_(Chưa có sprint nào đang chạy tuần này.)_\n';
  return msg;
}

/** Cắt theo dòng để không vượt 2000 ký tự Discord. */
function chunk(message: string, size = 1900): string[] {
  const parts: string[] = [];
  let buf = '';
  for (const line of message.split('\n')) {
    const withNl = line + '\n';
    if (buf.length + withNl.length > size) {
      if (buf) parts.push(buf);
      buf = withNl;
    } else {
      buf += withNl;
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

function push<T>(m: Map<string | null, T[]> | Map<string, T[]>, k: string | null, v: T): void {
  const map = m as Map<string | null, T[]>;
  const arr = map.get(k);
  if (arr) arr.push(v);
  else map.set(k, [v]);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

/** uid từ JWT người gọi (chế độ TEST). null nếu không phải JWT (vd publishable key của cron). */
function uidFromJwt(req: Request): string | null {
  const auth = req.headers.get('Authorization') ?? '';
  const tok = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const parts = tok.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '==='.slice((b64.length + 3) % 4);
    return JSON.parse(atob(padded)).sub ?? null;
  } catch {
    return null;
  }
}

async function isAdmin(uid: string): Promise<boolean> {
  const rows = await pg<{ role: string }>(`profiles?id=eq.${uid}&select=role`);
  return rows.length > 0 && ['admin', 'owner'].includes(rows[0].role);
}

/** Sprint đang chạy = sprint có [start,end] phủ NOW, lấy cái bắt đầu muộn nhất (như web). */
async function currentSprint(): Promise<{ id: string; name: string } | null> {
  const nowIso = new Date().toISOString();
  const rows = await pg<{ id: string; name: string }>(
    `sprints?start_date=lte.${nowIso}&end_date=gte.${nowIso}&order=start_date.desc&limit=1&select=id,name`,
  );
  return rows[0] ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* cron gửi body rỗng -> full mode */
  }
  const testProjectId = typeof body?.projectId === 'string' ? (body.projectId as string) : null;
  const testWebhookIn = typeof body?.webhook === 'string' ? (body.webhook as string).trim() : '';

  try {
    const now = new Date();
    const t = vnParts(now);
    const todayNum = dayNum(t.y, t.mo, t.da);
    // Ngày làm việc trước: thứ 2 (wd=1) lùi 3 ngày về thứ 6, còn lại lùi 1.
    const prev = new Date(Date.UTC(t.y, t.mo, t.da) - (t.wd === 1 ? 3 : 1) * DAY_MS);
    const yv = { y: prev.getUTCFullYear(), mo: prev.getUTCMonth(), da: prev.getUTCDate() };
    const yLabel = ddmm(yv.y, yv.mo, yv.da);
    const tLabel = ddmm(t.y, t.mo, t.da);
    const startIso = vnMidnightUtc(yv.y, yv.mo, yv.da).toISOString();
    const endIso = vnMidnightUtc(t.y, t.mo, t.da).toISOString();

    // ---- TEST MODE: 1 project, admin bấm "Gửi thử" ----
    if (testProjectId) {
      const uid = uidFromJwt(req);
      if (!uid || !(await isAdmin(uid))) {
        return json({ ok: false, error: 'forbidden', message: 'Chỉ admin mới gửi thử được.' }, 403);
      }
      const prjs = await pg<{ id: string; name: string; daily_report_webhook: string | null }>(
        `projects?id=eq.${testProjectId}&select=id,name,daily_report_webhook`,
      );
      if (prjs.length === 0) return json({ ok: false, error: 'project_not_found' }, 404);
      const prj = prjs[0];
      const webhook = testWebhookIn || (prj.daily_report_webhook ?? '').trim();
      if (!webhook) return json({ ok: false, error: 'no_webhook', message: 'Chưa có webhook để gửi thử.' }, 400);

      const [sprint, profilesRaw] = await Promise.all([
        currentSprint(),
        pg<Profile>('profiles?select=id,display_name,discord_id'),
      ]);
      const profiles = new Map(profilesRaw.map((p) => [p.id, p]));
      // CHỈ task của sprint đang chạy tuần này (theo ngày), trong project.
      const open = sprint
        ? await pg<Task>(`tasks?sprint_id=eq.${sprint.id}&status=neq.done&project_id=eq.${prj.id}&select=${TASK_FIELDS}`)
        : [];
      const done = sprint
        ? await pg<Task>(
            `tasks?sprint_id=eq.${sprint.id}&status=eq.done&project_id=eq.${prj.id}&due_date=gte.${startIso}&due_date=lt.${endIso}&select=${TASK_FIELDS}`,
          )
        : [];
      const msg = buildMessage(prj.name, sprint?.name ?? null, done, open, profiles, yLabel, tLabel, todayNum, true);
      const sent = await postWebhook(webhook, msg);
      return json({ ok: true, test: true, project: prj.name, sent, openCount: open.length, doneCount: done.length });
    }

    // ---- FULL MODE: cron, mọi project có webhook ----
    const [sprint, projectsRaw, profilesRaw] = await Promise.all([
      currentSprint(),
      pg<{ id: string; name: string; daily_report_webhook: string | null }>(
        'projects?select=id,name,daily_report_webhook',
      ),
      pg<Profile>('profiles?select=id,display_name,discord_id'),
    ]);

    const projects = projectsRaw.filter((p) => (p.daily_report_webhook ?? '').trim());
    const profiles = new Map(profilesRaw.map((p) => [p.id, p]));

    if (projects.length === 0) {
      return json({ ok: true, note: 'Không project nào cấu hình webhook.', sent: 0 });
    }

    // CHỈ task của sprint đang chạy tuần này. Hôm nay = chưa xong; Hôm qua = done ngày trước.
    const openTasks = sprint
      ? await pg<Task>(`tasks?sprint_id=eq.${sprint.id}&status=neq.done&select=${TASK_FIELDS}`)
      : [];
    const doneTasks = sprint
      ? await pg<Task>(
          `tasks?sprint_id=eq.${sprint.id}&status=eq.done&due_date=gte.${startIso}&due_date=lt.${endIso}&select=${TASK_FIELDS}`,
        )
      : [];

    const openByPrj = new Map<string, Task[]>();
    for (const tk of openTasks) if (tk.project_id) push(openByPrj, tk.project_id, tk);
    const doneByPrj = new Map<string, Task[]>();
    for (const tk of doneTasks) if (tk.project_id) push(doneByPrj, tk.project_id, tk);

    const results: { project: string; sent: number }[] = [];
    for (const prj of projects) {
      const msg = buildMessage(
        prj.name, sprint?.name ?? null, doneByPrj.get(prj.id) ?? [], openByPrj.get(prj.id) ?? [],
        profiles, yLabel, tLabel, todayNum, false,
      );
      const sent = await postWebhook((prj.daily_report_webhook as string).trim(), msg);
      results.push({ project: prj.name, sent });
    }

    return json({ ok: true, sprint: sprint?.name ?? null, projects: results });
  } catch (err) {
    console.error('LOI: daily-report thất bại:', (err as Error).message);
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});
