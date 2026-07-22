// Ghi dữ liệu ĐÁNH GIÁ thành viên: ghi chú theo sprint (member_sprint_notes) + hàng đợi AI
// tổng hợp theo kỳ (member_review_requests). RLS (0059/0060) admin-only cho MỌI thao tác —
// member gọi vào nhận 42501, caller tự hiện thông báo. Naming boundary snake↔camel chuyển ngay
// tại đây (chiều ngược inline; chiều xuôi qua rowTo* trong mappers).

import { supabase } from '../supabase';
import { rowToMemberSprintNote } from './mappers';
import type { MemberSprintNote, PeriodKind } from '../types';

/* ------------------------------ Ghi chú theo sprint ------------------------------ */

export interface MemberNotePatch {
  overview?: string;
  highlights?: string;
  concerns?: string;
  rating?: number | null;
}

/**
 * Đặt ghi chú của MỘT người trong MỘT sprint. Một dòng dùng chung (khoá member_id+sprint_id),
 * sửa-đè; updated_by = người sửa cuối. Tạo nếu chưa có, cập nhật nếu đã có.
 */
export async function upsertMemberSprintNote(
  memberId: string,
  sprintId: string,
  patch: MemberNotePatch,
  updatedBy: string | null,
): Promise<void> {
  const row: Record<string, unknown> = {
    member_id: memberId,
    sprint_id: sprintId,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  };
  if (patch.overview !== undefined) row.overview = patch.overview;
  if (patch.highlights !== undefined) row.highlights = patch.highlights;
  if (patch.concerns !== undefined) row.concerns = patch.concerns;
  if (patch.rating !== undefined) row.rating = patch.rating; // null = bỏ chấm
  const { error } = await supabase
    .from('member_sprint_notes')
    .upsert(row, { onConflict: 'member_id,sprint_id' });
  if (error) throw error;
}

export async function deleteMemberSprintNote(id: string): Promise<void> {
  const { error } = await supabase.from('member_sprint_notes').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Lịch sử ghi chú của một người qua các sprint (mới nhất trước). Embed sprints(...) để có
 * tên/ngày sprint mà không cần query thứ hai (RLS sprints mở đọc). Cho tab "Ghi chú" ở
 * MemberModal. Sắp client-side theo ngày bắt đầu sprint — ổn định bất kể thứ tự ghi note.
 */
export async function fetchMemberNotes(memberId: string, limit = 24): Promise<MemberSprintNote[]> {
  const { data, error } = await supabase
    .from('member_sprint_notes')
    .select('*, sprints ( name, start_date, end_date )')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const notes = (data ?? []).map(rowToMemberSprintNote);
  return notes.sort((a, b) => (b.sprintStart?.toMillis() ?? 0) - (a.sprintStart?.toMillis() ?? 0));
}

/* ------------------------------ Hàng đợi AI tổng hợp ------------------------------ */

/**
 * Xếp yêu cầu AI tổng hợp đánh giá theo kỳ: bot (service-role) rút hàng đợi, đọc note trong kỳ,
 * chạy Claude, ghi member_period_reviews. Trả id để caller theo dõi status. `force` = tạo lại
 * dù đã có kết quả. `periodStart/periodEnd` do web tính sẵn ('YYYY-MM-DD') → bot khỏi làm toán kỳ.
 */
export async function enqueueMemberReview(
  targetUserId: string,
  periodKind: PeriodKind,
  periodStart: string,
  periodEnd: string,
  force: boolean,
  requestedBy: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('member_review_requests')
    .insert({
      target_user_id: targetUserId,
      period_kind: periodKind,
      period_start: periodStart,
      period_end: periodEnd,
      force,
      requested_by: requestedBy || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export interface MemberReviewRequestStatus {
  status: 'pending' | 'done' | 'error';
  result: string;
}

export async function fetchMemberReviewRequest(id: string): Promise<MemberReviewRequestStatus> {
  const { data, error } = await supabase
    .from('member_review_requests')
    .select('status, result')
    .eq('id', id)
    .single();
  if (error) throw error;
  return { status: data.status, result: data.result ?? '' };
}
