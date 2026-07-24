// Gom NHÓM / LỌC ghi chú đánh giá theo kỳ: Sprint / Tháng / Quý. Thuần logic, không side effect —
// mốc xếp kỳ là ngày BẮT ĐẦU sprint (lui về ngày tạo nếu note lẻ chưa embed sprint).

import type { MemberSprintNote } from '../types';

export type NotePeriod = 'sprint' | 'month' | 'quarter';

export const NOTE_PERIODS: { id: NotePeriod; label: string }[] = [
  { id: 'sprint', label: 'Sprint' },
  { id: 'month', label: 'Tháng' },
  { id: 'quarter', label: 'Quý' },
];

export interface NoteBucket {
  key: string;
  label: string;
}

/** Ngày mốc để xếp kỳ: ưu tiên ngày bắt đầu sprint, lui về ngày tạo. Null nếu thiếu cả hai. */
function noteDate(note: MemberSprintNote): Date | null {
  return note.sprintStart?.toDate() ?? note.createdAt?.toDate() ?? null;
}

/** Kỳ (key + nhãn hiển thị) của MỘT note theo chiều lọc đang chọn. Null = không xếp được. */
function bucketOf(note: MemberSprintNote, period: NotePeriod): NoteBucket | null {
  if (period === 'sprint') {
    return note.sprintId ? { key: note.sprintId, label: note.sprintName || 'Sprint' } : null;
  }
  const d = noteDate(note);
  if (!d) return null;
  const year = d.getFullYear();
  if (period === 'month') {
    const m = d.getMonth() + 1;
    return { key: `${year}-${String(m).padStart(2, '0')}`, label: `Tháng ${m}/${year}` };
  }
  const q = Math.floor(d.getMonth() / 3) + 1;
  return { key: `${year}-Q${q}`, label: `Quý ${q}/${year}` };
}

/**
 * Các kỳ CÓ ghi chú, không trùng, giữ thứ tự của `notes` (đầu vào đã mới→cũ) để đổ vào ô lọc.
 */
export function noteBuckets(notes: MemberSprintNote[], period: NotePeriod): NoteBucket[] {
  const seen = new Set<string>();
  const out: NoteBucket[] = [];
  for (const n of notes) {
    const b = bucketOf(n, period);
    if (!b || seen.has(b.key)) continue;
    seen.add(b.key);
    out.push(b);
  }
  return out;
}

/** Lọc note về đúng kỳ đã chọn. `key` rỗng = giữ tất cả. */
export function filterNotesByBucket(
  notes: MemberSprintNote[],
  period: NotePeriod,
  key: string,
): MemberSprintNote[] {
  if (!key) return notes;
  return notes.filter((n) => bucketOf(n, period)?.key === key);
}
