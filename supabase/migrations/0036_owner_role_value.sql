-- 0036 — Thêm giá trị 'owner' vào enum user_role (tầng trên 'admin').
--
-- TÁCH riêng khỏi 0037 là BẮT BUỘC, không phải cho gọn: Postgres không cho DÙNG một
-- enum value ngay trong transaction vừa THÊM nó ("unsafe use of new value"). Bootstrap
-- owner + is_owner()/is_admin() (đều tham chiếu literal 'owner') phải nằm ở migration
-- SAU, khi giá trị đã commit. Mỗi apply_migration là một transaction → 0036 xong rồi 0037.

alter type public.user_role add value if not exists 'owner';
