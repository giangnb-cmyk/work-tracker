-- Feature giữ được link tài liệu + ảnh ref giống task.
--
-- Cùng shape với `tasks.attachments` (jsonb mảng Attachment, phân biệt bằng `kind`:
-- 'link' | 'image'), nên tái dùng nguyên AttachmentsField / RefImagesSection ở web mà
-- không phải đẻ thêm kiểu mới.
--
-- Task KHÔNG sao chép mảng này: task gắn vào feature sẽ ĐỌC thẳng ref của feature lúc
-- hiển thị. Sao chép thì thêm ref vào feature sau này các task cũ sẽ không thấy, và hai
-- bản dữ liệu sẽ trôi lệch nhau.
alter table public.features
  add column attachments jsonb not null default '[]';
