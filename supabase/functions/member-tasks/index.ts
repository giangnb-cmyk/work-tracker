// GET /functions/v1/member-tasks — task của MỘT nhân sự, cho APP NGOÀI đọc.
//
// Auth: header `x-api-key`, so SHA-256 với public.api_keys (migration 0043) — KHÔNG dùng
// JWT Supabase, function deploy với verify_jwt = false. Service-role key ở đây là env do
// Supabase tự nạp cho Edge Function (nằm phía Supabase, không phải Vercel/web bundle).
//
// Query params:
//   email=<email> | user_id=<uuid> | discord_id=<id>   — chọn ĐÚNG MỘT cách định danh
//   status=active (mặc định: todo,in_progress,review) | all | "todo,review" (danh sách)
//   project_id=<uuid>                                  — tuỳ chọn, lọc theo dự án
//
// Trả về: { member, statusFilter, count, tasks[] } — camelCase, kèm shortCode để app
// ngoài tự ghép link web `/t/<shortCode>`.

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done'];
const ACTIVE_STATUSES = ['todo', 'in_progress', 'review'];
// Thứ tự trả về: việc đang chạy trước, việc đã xong cuối.
const STATUS_RANK: Record<string, number> = { in_progress: 0, review: 1, todo: 2, done: 3 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Khớp x-api-key với api_keys (hash), tiện thể ghi last_used_at (fire-and-forget). */
async function checkApiKey(req: Request): Promise<boolean> {
  const key = req.headers.get('x-api-key') ?? '';
  if (!key) return false;
  const hash = await sha256Hex(key);
  const { data, error } = await supabase
    .from('api_keys')
    .select('id')
    .eq('key_hash', hash)
    .eq('enabled', true)
    .maybeSingle();
  if (error) {
    console.error('LOI: tra bảng api_keys thất bại:', error.message);
    return false;
  }
  if (!data) return false;
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(({ error: e }) => {
      if (e) console.error('LOI: không ghi được last_used_at:', e.message);
    });
  return true;
}

interface MemberRow {
  id: string;
  email: string;
  display_name: string;
  photo_url: string;
  job_role: string | null;
  discord_id: string | null;
}

/** Tìm nhân sự theo đúng một trong ba định danh; trả mã lỗi để handler báo 400/404. */
async function findMember(
  params: URLSearchParams,
): Promise<{ member?: MemberRow; error?: string }> {
  const userId = params.get('user_id');
  const email = params.get('email');
  const discordId = params.get('discord_id');
  if ([userId, email, discordId].filter(Boolean).length !== 1) {
    return { error: 'need_one_identifier' };
  }

  const cols = 'id, email, display_name, photo_url, job_role, discord_id';
  let query = supabase.from('profiles').select(cols);
  if (userId) {
    if (!UUID_RE.test(userId)) return { error: 'bad_user_id' };
    query = query.eq('id', userId);
  } else if (email) {
    // ilike chỉ để so KHÔNG phân biệt hoa thường — escape ký tự pattern để khớp đúng chuỗi.
    const escaped = email.trim().replace(/[\\%_]/g, (c) => '\\' + c);
    query = query.ilike('email', escaped);
  } else {
    query = query.eq('discord_id', discordId!.trim());
  }

  const { data, error } = await query.limit(1);
  if (error) {
    console.error('LOI: tra profiles thất bại:', error.message);
    return { error: 'db_error' };
  }
  if (!data?.length) return { error: 'member_not_found' };
  return { member: data[0] as MemberRow };
}

function parseStatuses(raw: string | null): string[] | null {
  if (!raw || raw === 'active') return ACTIVE_STATUSES;
  if (raw === 'all') return [...TASK_STATUSES];
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length || parts.some((p) => !TASK_STATUSES.includes(p))) return null;
  return parts;
}

interface TaskRow {
  id: string;
  short_code: string | null;
  title: string;
  description: string;
  status: string;
  priority: string;
  points: number;
  tags: string[];
  due_start: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  subtasks: { id: string; title: string; done: boolean }[] | null;
  project_id: string | null;
  feature_id: string | null;
  sprint_id: string | null;
  projects: { name: string } | null;
  features: { name: string } | null;
  sprints: { name: string; status: string } | null;
}

function toApiTask(r: TaskRow, now: Date) {
  const subtasks = r.subtasks ?? [];
  return {
    id: r.id,
    shortCode: r.short_code,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    points: r.points,
    tags: r.tags,
    project: r.project_id ? { id: r.project_id, name: r.projects?.name ?? '' } : null,
    feature: r.feature_id ? { id: r.feature_id, name: r.features?.name ?? '' } : null,
    sprint: r.sprint_id
      ? { id: r.sprint_id, name: r.sprints?.name ?? '', status: r.sprints?.status ?? '' }
      : null,
    dueStart: r.due_start,
    dueDate: r.due_date,
    overdue: r.status !== 'done' && !!r.due_date && new Date(r.due_date) < now,
    subtasks: { done: subtasks.filter((s) => s.done).length, total: subtasks.length },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function fetchTasks(memberId: string, statuses: string[], projectId: string | null) {
  let query = supabase
    .from('tasks')
    .select(
      // Hint !fkey bắt buộc: tasks→sprints còn đường thứ hai qua task_sprints,
      // để PostgREST tự đoán là nó từ chối vì nhập nhằng quan hệ.
      `id, short_code, title, description, status, priority, points, tags,
       due_start, due_date, created_at, updated_at, subtasks,
       project_id, projects:projects!tasks_project_id_fkey ( name ),
       feature_id, features:features!tasks_feature_id_fkey ( name ),
       sprint_id,  sprints:sprints!tasks_sprint_id_fkey ( name, status )`,
    )
    .eq('assignee_id', memberId)
    .in('status', statuses);
  if (projectId) query = query.eq('project_id', projectId);
  return await query;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });

  if (!(await checkApiKey(req))) {
    return json(401, { error: 'unauthorized', message: 'Thiếu hoặc sai header x-api-key.' });
  }

  const params = new URL(req.url).searchParams;

  const statuses = parseStatuses(params.get('status'));
  if (!statuses) {
    return json(400, {
      error: 'bad_status',
      message: `status phải là "active", "all" hoặc danh sách trong: ${TASK_STATUSES.join(', ')}.`,
    });
  }
  const projectId = params.get('project_id');
  if (projectId && !UUID_RE.test(projectId)) {
    return json(400, { error: 'bad_project_id', message: 'project_id phải là uuid.' });
  }

  const found = await findMember(params);
  if (!found.member) {
    if (found.error === 'member_not_found') {
      return json(404, { error: 'member_not_found', message: 'Không tìm thấy nhân sự.' });
    }
    if (found.error === 'db_error') {
      return json(500, { error: 'db_error', message: 'Lỗi truy vấn dữ liệu.' });
    }
    return json(400, {
      error: found.error,
      message: 'Cần đúng MỘT trong: email, user_id (uuid) hoặc discord_id.',
    });
  }
  const member = found.member;

  const { data, error } = await fetchTasks(member.id, statuses, projectId);
  if (error) {
    console.error('LOI: tra tasks thất bại:', error.message);
    return json(500, { error: 'db_error', message: 'Lỗi truy vấn dữ liệu.' });
  }

  const now = new Date();
  const tasks = ((data ?? []) as unknown as TaskRow[])
    .map((r) => toApiTask(r, now))
    .sort(
      (a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
        (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
    );

  return json(200, {
    member: {
      id: member.id,
      email: member.email,
      displayName: member.display_name,
      photoUrl: member.photo_url,
      jobRole: member.job_role,
      discordId: member.discord_id,
    },
    statusFilter: statuses,
    count: tasks.length,
    tasks,
  });
});
