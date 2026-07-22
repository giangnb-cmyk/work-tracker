-- Ngày ÁP DỤNG mức lương ("tăng từ hôm nào") — khác changed_at (lúc bấm Lưu): tăng lương
-- thường chốt hôm nay nhưng áp dụng từ đầu tháng sau. Cột trên member_compensation là ngày
-- áp dụng của MỨC HIỆN TẠI; trigger chép nó vào từng dòng lịch sử.
alter table public.member_compensation add column if not exists effective_from date;
alter table public.member_comp_history  add column if not exists effective_from date;

create or replace function public.log_member_comp_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.monthly_salary, 0) <> 0 then
      insert into public.member_comp_history (member_id, old_salary, new_salary, effective_from, changed_by)
      values (new.member_id, null, new.monthly_salary, new.effective_from, coalesce(new.updated_by, auth.uid()));
    end if;
  elsif new.monthly_salary is distinct from old.monthly_salary then
    insert into public.member_comp_history (member_id, old_salary, new_salary, effective_from, changed_by)
    values (new.member_id, old.monthly_salary, new.monthly_salary, new.effective_from, coalesce(new.updated_by, auth.uid()));
  end if;
  return new;
end;
$$;
