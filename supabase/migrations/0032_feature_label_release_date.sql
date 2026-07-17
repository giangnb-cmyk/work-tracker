-- 0032 — Ngày phát hành của nhãn version (feature_labels.release_date).
--
-- Timeline tới giờ suy mốc của một version từ hạn các task bên trong. Nhưng lịch phát
-- hành là thứ CHỐT TRƯỚC, nằm ở sheet release của team (tab 'Timeline'), và không đổi
-- theo việc task bị dời hạn — suy ngược từ task ra là kể sai câu chuyện.
--
-- Cột nằm ở feature_labels vì version CHÍNH LÀ một nhãn (xem DATA_MODEL) — không đẻ
-- thêm bảng cho một trường.
--
-- NULL với mọi nhãn không phải version (Shop, IAP…) và với version chưa chốt ngày;
-- Timeline gặp NULL thì quay về suy từ task như cũ, không gãy.
--
-- Web không đọc được Google Sheets (service account chỉ có ở bot), nên giá trị phải nằm
-- trong DB. Nạp dữ liệu để riêng, không nhét vào migration: schema dùng chung cho mọi
-- dự án, còn ngày release là của RIÊNG M1 - Tasty Merge.

alter table public.feature_labels add column if not exists release_date date;

comment on column public.feature_labels.release_date is
  'Ngày phát hành đã chốt của nhãn version (nguồn: sheet release của team). NULL = nhãn '
  'không phải version, hoặc version chưa chốt ngày -> Timeline suy mốc từ hạn task.';
