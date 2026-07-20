// GET /functions/v1/member-tasks — task của MỘT nhân sự, cho APP NGOÀI đọc.
//
// Auth: header `x-api-key`, so SHA-256 với public.api_keys (migration 0043) — KHÔNG dùng
// JWT Supabase, function deploy với verify_jwt = false.
//
// Tối ưu độ trễ (migration 0044): KHÔNG import supabase-js (nạp npm làm cold start chậm
// hơn hẳn) và toàn bộ logic DB nằm trong MỘT RPC `api_member_tasks` (check key → tìm
// nhân sự → lấy task) — một round-trip thay vì ba. Function này chỉ còn: validate input,
// hash key, fetch RPC, map mã lỗi.
//
// Query params:
//   email=<email> | user_id=<uuid> | discord_id=<id>   — chọn ĐÚNG MỘT cách định danh
//   status=active (mặc định: todo,in_progress,review) | all | "todo,review" (danh sách)
//   project_id=<uuid>                                  — tuỳ chọn, lọc theo dự án
//
// Trả về: { member, statusFilter, count, tasks[] } — camelCase, kèm shortCode để app
// ngoài tự ghép link web `/t/<shortCode>`.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done'];
const ACTIVE_STATUSES = ['todo', 'in_progress', 'review'];
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

function parseStatuses(raw: string | null): string[] | null {
  if (!raw || raw === 'active') return ACTIVE_STATUSES;
  if (raw === 'all') return [...TASK_STATUSES];
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length || parts.some((p) => !TASK_STATUSES.includes(p))) return null;
  return parts;
}

/** Một round-trip DB duy nhất: RPC làm hết (key → member → tasks), xem migration 0044. */
async function callRpc(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/api_member_tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`PostgREST trả ${res.status}: ${detail.slice(0, 300)}`);
  }
  return await res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });

  const key = req.headers.get('x-api-key') ?? '';
  if (!key) {
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

  const userId = params.get('user_id');
  const email = params.get('email');
  const discordId = params.get('discord_id');
  if ([userId, email, discordId].filter(Boolean).length !== 1) {
    return json(400, {
      error: 'need_one_identifier',
      message: 'Cần đúng MỘT trong: email, user_id (uuid) hoặc discord_id.',
    });
  }
  if (userId && !UUID_RE.test(userId)) {
    return json(400, { error: 'bad_user_id', message: 'user_id phải là uuid.' });
  }
  const projectId = params.get('project_id');
  if (projectId && !UUID_RE.test(projectId)) {
    return json(400, { error: 'bad_project_id', message: 'project_id phải là uuid.' });
  }

  try {
    const result = await callRpc({
      p_key_hash: await sha256Hex(key),
      p_email: email?.trim() ?? null,
      p_user_id: userId ?? null,
      p_discord_id: discordId?.trim() ?? null,
      p_statuses: statuses,
      p_project_id: projectId ?? null,
    });

    if (result.error === 'unauthorized') {
      return json(401, { error: 'unauthorized', message: 'Thiếu hoặc sai header x-api-key.' });
    }
    if (result.error === 'member_not_found') {
      return json(404, { error: 'member_not_found', message: 'Không tìm thấy nhân sự.' });
    }
    return json(200, result);
  } catch (err) {
    console.error('LOI: gọi RPC api_member_tasks thất bại:', (err as Error).message);
    return json(500, { error: 'db_error', message: 'Lỗi truy vấn dữ liệu.' });
  }
});
