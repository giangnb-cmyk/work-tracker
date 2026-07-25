-- Ghi chú thành viên chuyển từ "MỘT dòng/(member, sprint), sửa-đè" sang NHẬT KÝ APPEND-ONLY:
-- mỗi lần admin lưu là MỘT DÒNG MỚI mang ngày ghi hôm đó (created_at).
--
-- Vì sao đổi: quản lý log HẰNG NGÀY trong sprint ("đi muộn 10h", "ở lại sửa file…") — model
-- một-dòng-ghi-đè gộp mọi ngày vào một bản ghi mang một ngày duy nhất, và form phải điền sẵn
-- nội dung cũ để sửa (mở note là thấy log cũ trong ô nhập). Append-only thì mỗi ngày một dòng,
-- form luôn trống, lịch sử đọc như nhật ký. AI tổng hợp (0060) vẫn đọc được: mỗi dòng là một
-- ghi chú có ngày, tập dữ liệu còn giàu hơn.
--
-- RLS/index giữ nguyên từ 0059 (member_sprint_notes_member_idx (member_id, created_at desc)
-- vốn đã hợp truy vấn nhật ký). updated_by/updated_at giờ mang nghĩa "người ghi/lúc ghi dòng này".
alter table public.member_sprint_notes
  drop constraint if exists member_sprint_notes_uniq;
