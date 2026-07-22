// Pure formatting helpers — no side effects, easy to test.

import type { Timestamp } from './time';

export function tsToDate(ts: Timestamp | null | undefined): Date | null {
  return ts ? ts.toDate() : null;
}

export function formatDate(ts: Timestamp | null | undefined): string {
  const d = tsToDate(ts);
  if (!d) return '—';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function toInputDate(ts: Timestamp | null | undefined): string {
  const d = tsToDate(ts);
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

/** Whole days from now until `ts` (negative = overdue). */
export function daysUntil(ts: Timestamp | null | undefined): number | null {
  const d = tsToDate(ts);
  if (!d) return null;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

/**
 * The Friday (end of the work week) on or after `d`. Created Tue → this Fri;
 * created Sat/Sun → next Fri. Time is set to end-of-day for a sensible deadline.
 */
export function endOfWorkWeek(d: Date): Date {
  const FRIDAY = 5;
  let diff = FRIDAY - d.getDay(); // getDay: 0=Sun .. 6=Sat
  if (diff < 0) diff += 7;
  const end = new Date(d);
  end.setDate(d.getDate() + diff);
  end.setHours(23, 59, 59, 0);
  return end;
}

/**
 * Chủ nhật KẾT THÚC tuần (Mon→Sun) chứa `d`, đặt về cuối ngày.
 *
 * Sprint là một tuần, "hạn chót của task = chủ nhật của tuần" (yêu cầu người dùng). Tính
 * từ NGÀY BẮT ĐẦU sprint (thứ 2) -> +6 = chủ nhật; nên dù end_date của sprint lỡ đặt lệch
 * (vd thứ 2 tuần sau) thì hạn task vẫn rơi đúng chủ nhật.
 */
export function sundayOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun .. 6=Sat
  const diff = day === 0 ? 0 : 7 - day; // số ngày tới chủ nhật (0 nếu đã là CN)
  const end = new Date(d);
  end.setDate(d.getDate() + diff);
  end.setHours(23, 59, 59, 0);
  return end;
}

/** "14/07" or "14/07 → 18/07" when start & end differ. Dash for empty. */
export function formatDateRange(
  start: Timestamp | null | undefined,
  end: Timestamp | null | undefined,
): string {
  const s = tsToDate(start);
  const e = tsToDate(end);
  if (!s && !e) return '—';
  const fmt = (d: Date) => d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  if (s && e && s.toDateString() !== e.toDateString()) return `${fmt(s)} → ${fmt(e)}`;
  return fmt((e ?? s) as Date);
}

/** Relative time in Vietnamese: "vừa xong", "5 phút trước", "3 giờ trước", "2 ngày trước". */
export function timeAgo(ts: Timestamp | null | undefined): string {
  const d = tsToDate(ts);
  if (!d) return '';
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return 'vừa xong';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} ngày trước`;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Số tiền VND kiểu vi-VN: `30000000` → "30.000.000 ₫". Làm tròn về đồng. */
export function formatVnd(n: number): string {
  return `${Math.round(n).toLocaleString('vi-VN')} ₫`;
}

/** Hôm nay theo GIỜ MÁY dạng 'YYYY-MM-DD' (toISOString là UTC — lệch ngày lúc sáng sớm VN). */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' (— nếu rỗng/sai định dạng). */
export function formatIsoDate(s: string | null | undefined): string {
  if (!s) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

/**
 * Thâm niên kiểu lịch: "1 năm 1 tháng 21 ngày" (có năm) / "3 tháng 28 ngày" (chưa đủ năm —
 * giữ cả "0 tháng 17 ngày" cho khớp bảng Notion cũ). Từ `start` đến `end` (mặc định hôm
 * nay). start rỗng / tương lai / sai định dạng → '—'.
 */
export function tenureVi(start: string | null | undefined, end?: string | null): string {
  if (!start) return '—';
  const s = new Date(`${start}T00:00:00`);
  const e = end ? new Date(`${end}T00:00:00`) : new Date();
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return '—';
  let years = e.getFullYear() - s.getFullYear();
  let months = e.getMonth() - s.getMonth();
  let days = e.getDate() - s.getDate();
  if (days < 0) {
    months -= 1;
    // Mượn số ngày của THÁNG TRƯỚC mốc cuối (ngày 0 = ngày chót tháng trước).
    days += new Date(e.getFullYear(), e.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return years > 0 ? `${years} năm ${months} tháng ${days} ngày` : `${months} tháng ${days} ngày`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
