// Activity writes. Auto events (created / status_change) are logged by DB triggers;
// the client only inserts/edits comments here.

import { supabase } from '../supabase';
import type { Activity } from '../types';

export async function addComment(
  taskId: string,
  actorId: string,
  actorName: string,
  body: string,
): Promise<void> {
  const text = body.trim();
  if (!text) return;
  const { error } = await supabase.from('activity').insert({
    task_id: taskId,
    actor_id: actorId,
    actor_name: actorName,
    type: 'comment',
    body: text,
  });
  if (error) throw error;
}

/**
 * Sửa nội dung một bình luận. Ném lỗi khi không được phép.
 *
 * Chỉ gửi `body`: migration 0029 chốt phần còn lại ở DB — RLS cho sửa đúng bình luận của
 * chính mình, trigger ghim mọi cột khác và tự đóng dấu `edited_at`. Nút Sửa ở UI chỉ là
 * lớp thuận tiện, không phải lớp bảo vệ.
 */
export async function editComment(id: string, body: string): Promise<void> {
  const text = body.trim();
  if (!text) throw new Error('Bình luận không được để trống.');
  const { error } = await supabase.from('activity').update({ body: text }).eq('id', id);
  if (error) throw error;
}

/** Bình luận này có phải của `uid` không — quyết định có hiện nút Sửa. */
export function canEditComment(a: Activity, uid: string): boolean {
  return a.type === 'comment' && Boolean(a.actorId) && a.actorId === uid;
}
