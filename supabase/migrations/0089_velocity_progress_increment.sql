-- 0089 — Nhật ký tiến độ ghi SỐ LÀM TRONG NGÀY, tổng tự cộng dồn (đổi ngữ nghĩa 0086).
--
-- 0086 quy ước done_qty của mỗi mục là CỘNG DỒN tới hết ngày. Thực tế người ghi gõ số mình
-- vừa làm được ("hôm nay 12") và mong tổng tự tăng — gõ 12 hai ngày liền mà tổng vẫn 12 là
-- "không cộng dồn" (đã bị báo). Ghi theo ngày cũng tự nhiên hơn khi sửa: đổi số của một ngày
-- cũ không kéo theo phải sửa mọi ngày sau.
--
-- Đổi: done_qty = số làm được TRONG ngày `day`. Tổng = SUM(done_qty) của chart; trigger đồng
-- bộ velocity_charts.done_qty = SUM (thay cho "mục mới nhất"). Web cộng dồn theo ngày để vẽ
-- burn-up (lib/burnup.cumulate).
--
-- Dữ liệu đang có (dạng cộng dồn) đổi sang chênh lệch với mục liền trước, kẹp ≥ 0 — tổng
-- hiện tại của chart không đổi, chỉ cách hiểu từng dòng đổi.

with ranked as (
  select chart_id, day, done_qty,
         lag(done_qty) over (partition by chart_id order by day) as prev
  from public.velocity_chart_progress
)
update public.velocity_chart_progress p
   set done_qty = greatest(r.done_qty - coalesce(r.prev, 0), 0)
  from ranked r
 where r.chart_id = p.chart_id and r.day = p.day;

comment on column public.velocity_chart_progress.done_qty is
  'Số làm được TRONG ngày `day` (0089; trước đó là cộng dồn). Tổng của chart = SUM theo chart_id.';

create or replace function public.velocity_progress_sync_done()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chart uuid := coalesce(new.chart_id, old.chart_id);
  v_total numeric;
begin
  select coalesce(sum(done_qty), 0) into v_total
  from public.velocity_chart_progress
  where chart_id = v_chart;
  update public.velocity_charts
     set done_qty = v_total
   where id = v_chart and done_qty is distinct from v_total;
  return null;
end;
$$;

revoke execute on function public.velocity_progress_sync_done() from public, anon, authenticated;

-- Đồng bộ lại tổng SAU khi trigger đã đổi: câu UPDATE chuyển đổi ở trên chạy dưới trigger
-- CŨ ("mục mới nhất"), nên chart nào có dòng cuối = 0 đã bị ghi done_qty = 0 (đã dính khi áp
-- lần đầu). Ép về SUM cho mọi chart có nhật ký.
update public.velocity_charts c
   set done_qty = s.total
  from (select chart_id, sum(done_qty) as total from public.velocity_chart_progress group by chart_id) s
 where s.chart_id = c.id and c.done_qty is distinct from s.total;
