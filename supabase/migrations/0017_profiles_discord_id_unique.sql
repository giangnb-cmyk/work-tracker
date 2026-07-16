-- Mỗi Discord ID chỉ được thuộc về MỘT profile.
--
-- Vì sao cần: bot (`bot/skills/permissions.py`) quyết định ai là admin bằng cách tra
-- `profiles.discord_id` khớp với BOT_SENDER_ID. Cột này vốn không có ràng buộc nào, mà
-- RLS `profiles_update` lại cho phép mỗi người tự sửa hàng của mình — nên từ khi web mở
-- ô "Discord ID" trong hồ sơ cá nhân, một thành viên có thể điền TRÙNG Discord ID của
-- người khác. Khi đó `user_by_discord_id()` (`.eq(...).limit(1)`, không ORDER BY) trả về
-- một hàng tuỳ ý trong số trùng: admin thật có thể bị phân giải thành hàng của member và
-- bị chính bot của mình từ chối. Không leo thang được quyền (RLS chặn tự phong admin),
-- nhưng đủ để khoá nhầm admin và gán sai người báo cáo — mà lại im lặng.
--
-- Partial index (WHERE ... IS NOT NULL) để nhiều người CHƯA liên kết vẫn cùng để NULL
-- được: trong Postgres, NULL không đụng NULL trong unique index, còn chuỗi '' thì có —
-- nên tầng web ghi '' thành NULL (xem AuthContext.updateProfile).
--
-- Đã kiểm tra trước khi áp: 9/9 profile có discord_id và không có cái nào trùng.
create unique index if not exists profiles_discord_id_key
  on public.profiles (discord_id)
  where discord_id is not null;
