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
 * Ghi MỘT DÒNG NHẬT KÝ mới cho (người, sprint) — append-only từ 0062: mỗi lần lưu là một
 * entry mang ngày ghi hôm đó (created_at), KHÔNG ghi đè entry cũ. updated_by = người ghi
 * dòng này. Lịch sử đọc như nhật ký theo ngày ở tab "Lịch sử".
 */
export async function insertMemberSprintNote(
  memberId: string,
  sprintId: string,
  patch: MemberNotePatch,
  authorId: string | null,
): Promise<void> {
  const { error } = await supabase.from('member_sprint_notes').insert({
    member_id: memberId,
    sprint_id: sprintId,
    overview: patch.overview ?? '',
    highlights: patch.highlights ?? '',
    concerns: patch.concerns ?? '',
    rating: patch.rating ?? null,
    updated_by: authorId,
  });
  if (error) throw error;
}

export async function deleteMemberSprintNote(id: string): Promise<void> {
  const { error } = await supabase.from('member_sprint_notes').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Nhật ký ghi chú của một người (mới nhất trước, theo NGÀY GHI — mỗi entry một dòng, 0062).
 * Embed sprints(...) để có tên/ngày sprint mà không cần query thứ hai (RLS sprints mở đọc).
 * Cho tab "Ghi chú" ở MemberModal + tab "Lịch sử" ở MemberNoteModal.
 */
export async function fetchMemberNotes(memberId: string, limit = 60): Promise<MemberSprintNote[]> {
  const { data, error } = await supabase
    .from('member_sprint_notes')
    .select('*, sprints ( name, start_date, end_date )')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(rowToMemberSprintNote);
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
