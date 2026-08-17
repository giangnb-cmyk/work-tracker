-- Vá cảnh báo `function_search_path_mutable` cho `projects_stamp_paused_at` (0077).
--
-- Hàm không phải SECURITY DEFINER nên rủi ro thấp, nhưng để search_path thả nổi vẫn là một
-- cửa: ai đặt được search_path của phiên có thể chen một `now()` của schema khác vào trước
-- pg_catalog. Ghim rỗng cho khớp mọi hàm khác trong repo — `now()` là built-in nên vẫn
-- phân giải bình thường qua pg_catalog.
create or replace function public.projects_stamp_paused_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.paused_at := case when new.is_active then null else now() end;
  elsif new.is_active is distinct from old.is_active then
    new.paused_at := case when new.is_active then null else now() end;
  end if;
  return new;
end;
$$;
