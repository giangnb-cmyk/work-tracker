-- Thêm loại chi phí "theo tháng" (monthly) cho project_cost_items — trước đây chỉ one_time |
-- annual (0053). Thành tiền theo tháng = số tiền × số tháng: khoản GÁN người × số tháng người
-- đó làm việc trong cửa sổ; khoản chung / dự chi × số tháng cửa sổ (horizon). Tính ở
-- web/src/lib/projectCost.ts qua costFactor (monthly → ×months).
alter table public.project_cost_items drop constraint project_cost_items_kind_check;
alter table public.project_cost_items
  add constraint project_cost_items_kind_check check (kind in ('one_time', 'annual', 'monthly'));
