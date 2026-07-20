-- 0045: RPC public member_tasks — đường GỌI THẲNG PostgREST cho app ngoài, thay vì đi
-- vòng qua Edge Function (edge thêm ~0.3–2s: cold start + một hop mạng + TLS nội bộ).
-- PostgREST luôn ấm nên không bao giờ cold start; từ VN đo còn ~0.15–0.35s.
--
-- Bảo mật KHÔNG đổi: vẫn gate bằng API key trong bảng api_keys — chỉ khác chỗ hash
-- SHA-256 được tính ngay trong Postgres (pgcrypto) thay vì ở Edge Function. Hàm này
-- CỐ Ý cho anon execute: không có key hợp lệ thì chỉ nhận {"error":"unauthorized"},
-- ngang mức lộ của chính endpoint Edge Function (cũng public). Advisor sẽ than
-- SECURITY DEFINER gọi được từ ngoài — đó là chủ đích, đừng "sửa".
--
-- Nhận p_status dạng CHUỖI y hệt query param của Edge Function ('active' | 'all' |
-- 'todo,review') để hai đường vào có cùng một giao diện. Logic thật nằm ở
-- api_member_tasks (0044) — hàm này chỉ validate + hash rồi uỷ quyền.

create or replace function public.member_tasks(
  p_key        text,
  p_email      text default null,
  p_user_id    uuid default null,
  p_discord_id text default null,
  p_status     text default 'active',
  p_project_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statuses text[];
begin
  if p_key is null or p_key = '' then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  if p_status is null or p_status in ('', 'active') then
    v_statuses := array['todo','in_progress','review'];
  elsif p_status = 'all' then
    v_statuses := array['todo','in_progress','review','done'];
  else
    select array_agg(btrim(s)) into v_statuses
      from unnest(string_to_array(p_status, ',')) s
     where btrim(s) <> '';
    if v_statuses is null or exists (
      select 1 from unnest(v_statuses) s
       where s not in ('todo','in_progress','review','done')
    ) then
      return jsonb_build_object('error', 'bad_status');
    end if;
  end if;

  if (p_user_id is not null)::int
     + (nullif(btrim(coalesce(p_email, '')), '') is not null)::int
     + (nullif(btrim(coalesce(p_discord_id, '')), '') is not null)::int <> 1 then
    return jsonb_build_object('error', 'need_one_identifier');
  end if;

  return public.api_member_tasks(
    encode(extensions.digest(p_key, 'sha256'), 'hex'),
    nullif(btrim(coalesce(p_email, '')), ''),
    p_user_id,
    nullif(btrim(coalesce(p_discord_id, '')), ''),
    v_statuses,
    p_project_id
  );
end;
$$;

-- anon gọi được (đó là mục đích tồn tại của hàm); authenticated/web không cần đường này.
revoke execute on function public.member_tasks(text, text, uuid, text, text, uuid)
  from public, authenticated;
grant execute on function public.member_tasks(text, text, uuid, text, text, uuid)
  to anon, service_role;
