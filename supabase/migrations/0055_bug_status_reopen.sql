-- Thêm trạng thái 'reopen' cho bug — cột Kanban mới giữa Open và Fixing.
--
-- Bối cảnh: forum Discord đã có tag "Re-open" (tester gắn khi bug Done bị tái hiện) nhưng
-- app không có trạng thái tương ứng: bot suy cột từ tag mà không biết Re-open, lại ưu tiên
-- Done trước — nên bug bị mở lại VẪN nằm ở cột Done. Web/bot map tag "Re-open"/"Reopen"
-- (không phân biệt hoa thường) về trạng thái này; Re-open THẮNG Done khi thread mang cả hai.
--
-- ADD VALUE trong transaction: hợp lệ từ PG12 miễn là KHÔNG dùng giá trị mới trong cùng
-- transaction — file này chỉ thêm giá trị, không dùng.
alter type bug_status add value if not exists 'reopen' after 'open';
