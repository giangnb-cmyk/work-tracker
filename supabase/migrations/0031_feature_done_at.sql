-- 0031 — Đánh dấu TAY một feature là đã hoàn thành.
--
-- Tới giờ "feature xong" hoàn toàn suy ra từ task: xong khi MỌI task của nó xong, và
-- feature 0 task thì không bao giờ xong (0/0 = chưa làm gì, không phải đã xong).
-- Luật đó đúng cho việc chạy trong tracker, nhưng sai với dự án đã chạy từ TRƯỚC khi có
-- tracker: import cả rổ feature đã ship từ đời nào, không ai đi tạo lại task cho chúng —
-- và thế là chúng nằm đó, mãi mãi 0%.
--
-- `done_at` là lối ghi đè THỦ CÔNG: có giá trị = người dùng tự khẳng định đã xong, bất kể
-- task. NULL = quay lại suy từ task như cũ. Dùng timestamptz chứ không phải boolean —
-- "xong lúc nào" sau này còn dùng cho báo cáo, mà boolean thì mất luôn thông tin đó.
--
-- Không đụng dữ liệu cũ: mọi feature hiện có = NULL = giữ nguyên hành vi suy từ task.
--
-- Không cần policy mới: features_update (0026) đã gate theo hàng (admin), RLS không phân
-- quyền theo cột nên thêm cột là nằm sẵn trong policy đó.

alter table public.features add column if not exists done_at timestamptz;

comment on column public.features.done_at is
  'Mốc người dùng ĐÁNH DẤU TAY là feature đã xong (dự án chạy trước khi có tracker nên '
  'không có task để suy ra). NULL = suy từ task như thường: xong khi mọi task đã xong. '
  'Feature kind=''ongoing'' vẫn KHÔNG BAO GIỜ xong — cột này không lật được luật đó.';
