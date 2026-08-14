-- Mốc MONG MUỐN HOÀN THÀNH của một feature — điền tay ở popup Feature, vẽ lên Timeline.
--
-- Khác hẳn hai mốc đã có, đừng gộp:
--   * `features.done_at`  = đã xong LÚC NÀO (quá khứ, sự thật đã rồi — 0031).
--   * `feature_labels.release_date` = ngày phát hành của cả VERSION (0032), một mốc chung
--     cho hàng chục feature.
--   * cột này = HẸN cho RIÊNG feature này, có thể sớm hơn ngày release của version chứa nó
--     (làm xong trước để kịp test/đóng gói).
--
-- Kiểu `date` chứ không timestamptz: đây là ngày treo tường ("xong trước 20/08"), không
-- phải một thời điểm. Nhét giờ vào là lệch múi giờ thành lệch nguyên một ngày — cùng lý do
-- và cùng kiểu với feature_labels.release_date.
--
-- RLS: không cần policy mới (features đã có SELECT cho authenticated, INSERT/UPDATE =
-- is_admin(); policy ở mức HÀNG nên tự phủ cột mới).
alter table public.features
  add column if not exists target_date date;

comment on column public.features.target_date is
  'Mốc mong muốn hoàn thành feature (ngày treo tường). Hiện thành cờ 🎯 trên Timeline. '
  'NULL = chưa hẹn ngày. Khác done_at (đã xong lúc nào) và feature_labels.release_date (lịch cả version).';
