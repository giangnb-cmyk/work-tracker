-- 0030 — Loại feature thứ ba: 'standard' (có ngày xong nhưng KHÔNG bán).
--
-- 0026 chỉ có 'delivery' | 'ongoing', và 'delivery' được đặt tên/hiểu là "gói bán" —
-- thứ bán cho user (IAP, offer, pack). Thực tế rất nhiều feature vẫn có ngày ship mà
-- chẳng liên quan gì tới tiền: Settings, Login, Notification, Tutorial, Rating… (đúng
-- cột Type = 'Feature' trong sheet release).
--
-- Nhồi chúng vào 'delivery' là gọi sai tên; đẩy sang 'ongoing' còn sai nặng hơn:
-- 'ongoing' nghĩa là KHÔNG BAO GIỜ xong nên UI giấu luôn % và isFeatureDone không bao
-- giờ tính nó là hoàn thành.
--
-- 'standard' cư xử y hệt 'delivery' (có %, có "xong"), chỉ khác cái tên — nên KHÔNG
-- chuyển dữ liệu cũ: feature đang là 'delivery' vẫn hợp lệ cho tới khi người dùng tự đổi.
--
-- CHECK phải sửa bằng drop + add: Postgres không có "alter constraint" cho CHECK.

alter table public.features drop constraint if exists features_kind_check;
alter table public.features add constraint features_kind_check
  check (kind = any (array['delivery'::text, 'standard'::text, 'ongoing'::text]));

comment on column public.features.kind is
  'delivery = gói bán (IAP/thứ bán cho user, có ngày xong) | standard = tính năng thường '
  '(có ngày xong, không bán) | ongoing = chạy liên tục (polish/tuning, không bao giờ '
  '"done" nên UI hiện nhịp 30 ngày thay vì %).';
