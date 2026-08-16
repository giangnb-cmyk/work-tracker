-- 0075 — 'doc.manage' áp vào tài liệu DỰ ÁN (project_docs, 0066): sửa/xoá tài liệu của
-- người khác (mặc định chỉ admin và người tạo). Bảng `documents` (nguồn RAG) web không
-- ghi tới — bot dùng service key — nên quyền này đặt ở đây mới có chỗ dùng thật;
-- documents_write (0074) vẫn giữ has_perm('doc.manage') cho ai gọi REST trực tiếp.

drop policy if exists project_docs_update on public.project_docs;
create policy project_docs_update on public.project_docs
  for update to authenticated
  using ( public.has_perm('doc.manage') or created_by = (select auth.uid()) )
  with check ( public.has_perm('doc.manage') or created_by = (select auth.uid()) );

drop policy if exists project_docs_delete on public.project_docs;
create policy project_docs_delete on public.project_docs
  for delete to authenticated
  using ( public.has_perm('doc.manage') or created_by = (select auth.uid()) );
