-- Lịch sử LƯƠNG — "tăng từ hôm nào, từ bao nhiêu lên bao nhiêu" (hiện ở chi tiết thành viên).
--
-- Ghi bằng TRIGGER trên member_compensation chứ không phải từ client: mọi đường ghi (web,
-- SQL tay, bot sau này) đều bị bắt — client quên gọi cũng không lọt. Chỉ ghi khi MỨC LƯƠNG
-- thật sự đổi (sửa ngày vào/ra không tạo dòng rác); điền lần đầu ghi old_salary = null.
create table public.member_comp_history (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.profiles (id) on delete cascade,
  old_salary numeric,            -- null = điền lần đầu
  new_salary numeric not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles (id) on delete set null
);
alter table public.member_comp_history enable row level security;
create index member_comp_history_member_idx
  on public.member_comp_history (member_id, changed_at desc);

-- Chỉ admin/owner ĐỌC (dữ liệu lương). KHÔNG có policy ghi cho client: lịch sử chỉ do
-- trigger (SECURITY DEFINER, chạy quyền owner nên vượt RLS) ghi — không sửa/xoá được từ app.
create policy member_comp_history_select on public.member_comp_history
  for select to authenticated using ( public.is_admin() );

create or replace function public.log_member_comp_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Điền lần đầu: chỉ ghi khi có mức lương thật (tạo dòng 0 đồng là nhiễu).
    if coalesce(new.monthly_salary, 0) <> 0 then
      insert into public.member_comp_history (member_id, old_salary, new_salary, changed_by)
      values (new.member_id, null, new.monthly_salary, coalesce(new.updated_by, auth.uid()));
    end if;
  elsif new.monthly_salary is distinct from old.monthly_salary then
    insert into public.member_comp_history (member_id, old_salary, new_salary, changed_by)
    values (new.member_id, old.monthly_salary, new.monthly_salary, coalesce(new.updated_by, auth.uid()));
  end if;
  return new;
end;
$$;
revoke execute on function public.log_member_comp_change() from public, anon, authenticated;

create trigger member_comp_log_change
  after insert or update on public.member_compensation
  for each row execute function public.log_member_comp_change();
