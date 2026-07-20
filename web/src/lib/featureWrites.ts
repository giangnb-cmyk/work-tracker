// Admin-only feature writes. RLS requires admin. A feature belongs to a project.

import { supabase } from '../supabase';
import type { Attachment, Feature, FeatureKind } from '../types';

export interface FeatureInput {
  projectId: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  kind: FeatureKind;
  labelIds: string[];
  /** Link tài liệu + ảnh ref; mọi task của feature sẽ đọc lại mảng này. */
  attachments: Attachment[];
  /** Người tham gia thêm tay (uid) — xem 0046. */
  memberIds: string[];
  /** Đánh dấu tay là đã xong ngay lúc tạo (import feature đã ship từ lâu) — xem 0031. */
  done: boolean;
}

export async function createFeature(input: FeatureInput, createdBy: string): Promise<string> {
  const { data, error } = await supabase
    .from('features')
    .insert({
      project_id: input.projectId,
      name: input.name.trim(),
      icon: input.icon || '🧩',
      color: input.color || '#6366f1',
      description: input.description.trim(),
      kind: input.kind,
      label_ids: input.labelIds,
      attachments: input.attachments,
      member_ids: input.memberIds,
      done_at: input.done ? new Date().toISOString() : null,
      created_by: createdBy || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

/**
 * Patch feature từ UI. `done` là boolean cho tiện — lớp này tự đổi thành mốc `done_at`.
 *
 * Chỉ truyền `done` khi nó THỰC SỰ đổi: gửi `done: true` ở mọi lần lưu sẽ dập mốc cũ
 * bằng thời điểm hiện tại, mất luôn "xong từ bao giờ".
 */
export type FeaturePatch = Partial<Omit<Feature, 'doneAt'>> & { done?: boolean };

export async function updateFeature(id: string, patch: FeaturePatch): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.icon !== undefined) row.icon = patch.icon;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.kind !== undefined) row.kind = patch.kind;
  if (patch.labelIds !== undefined) row.label_ids = patch.labelIds;
  if (patch.attachments !== undefined) row.attachments = patch.attachments;
  if (patch.memberIds !== undefined) row.member_ids = patch.memberIds;
  if (patch.done !== undefined) row.done_at = patch.done ? new Date().toISOString() : null;
  const { error } = await supabase.from('features').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteFeature(id: string): Promise<void> {
  const { error } = await supabase.from('features').delete().eq('id', id);
  if (error) throw error;
}
