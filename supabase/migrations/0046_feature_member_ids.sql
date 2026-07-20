-- 0046_feature_member_ids
-- Người tham gia feature THÊM TAY (ngoài những người suy ra từ ai có task).
-- Web hợp nhất hai nguồn để hiển thị, và auto-gắn cả hai vào watcher của task mới thuộc
-- feature. Mảng uuid denormalize (không FK từng phần tử) — cùng khuôn với tasks.watcher_ids.
--
-- RLS: không cần policy mới. features_write = is_admin() là FOR ALL nên phủ luôn cột này;
-- features_select = true cho đọc. Cột nằm sẵn trong publication realtime của bảng features.

alter table public.features
  add column if not exists member_ids uuid[] not null default '{}';

comment on column public.features.member_ids is
  'Người tham gia feature thêm tay (uuid → profiles.id). Hợp nhất với người suy từ task ở UI; auto-gắn vào watcher_ids của task mới thuộc feature. Denormalize, không FK từng phần tử (như tasks.watcher_ids).';
