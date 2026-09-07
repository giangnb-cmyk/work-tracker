// Trục thời gian CHUNG cho các dòng Gantt tốc độ: mọi chart cùng một thang để so được
// cái nào chạy trước/sau. Thuần — không React. Ngày 'YYYY-MM-DD', tính qua lib/workdays.

import { addDaysIso, isoToUtcMs, utcMsToIso } from './workdays';

interface Span {
  startDate: string;
  endDate: string;
}

export interface AxisMonth {
  /** "Th 9/2026" */
  label: string;
  leftPct: number;
  widthPct: number;
}

export interface GanttAxis {
  from: string;
  to: string;
  months: AxisMonth[];
  /** Vị trí hôm nay (0..100). null nếu hôm nay rơi ngoài trục — không xảy ra vì trục luôn ôm hôm nay. */
  todayPct: number | null;
  /** Vị trí (0..100) của một ngày trên trục — kẹp trong biên. */
  pct: (iso: string) => number;
}

/** Đệm hai đầu trục để bar sát biên không dính mép và luôn thấy được hôm nay. */
const PAD_DAYS = 3;
/** Không có chart nào: hiện quãng quanh hôm nay để trục không rỗng. */
const EMPTY_BEFORE_DAYS = 7;
const EMPTY_AFTER_DAYS = 30;

function monthLabel(ms: number): string {
  const d = new Date(ms);
  return `Th ${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
}

/** Các đoạn tháng phủ [fromMs, toMs], đã cắt theo biên trục. */
function monthSegments(fromMs: number, toMs: number): AxisMonth[] {
  const span = toMs - fromMs;
  const out: AxisMonth[] = [];
  const first = new Date(fromMs);
  let cursor = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1);
  while (cursor <= toMs) {
    const d = new Date(cursor);
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    const segFrom = Math.max(cursor, fromMs);
    const segTo = Math.min(next, toMs);
    if (segTo > segFrom) {
      out.push({
        label: monthLabel(cursor),
        leftPct: ((segFrom - fromMs) / span) * 100,
        widthPct: ((segTo - segFrom) / span) * 100,
      });
    }
    cursor = next;
  }
  return out;
}

export function buildAxis(spans: Span[], today: string): GanttAxis {
  let from: string;
  let to: string;
  if (spans.length === 0) {
    from = addDaysIso(today, -EMPTY_BEFORE_DAYS);
    to = addDaysIso(today, EMPTY_AFTER_DAYS);
  } else {
    // Ôm cả hôm nay: chart toàn tương lai (hoặc toàn quá khứ) vẫn thấy vạch hôm nay.
    const starts = [...spans.map((s) => s.startDate), today];
    const ends = [...spans.map((s) => s.endDate), today];
    from = addDaysIso(starts.reduce((a, b) => (a < b ? a : b)), -PAD_DAYS);
    to = addDaysIso(ends.reduce((a, b) => (a > b ? a : b)), PAD_DAYS);
  }
  const fromMs = isoToUtcMs(from);
  // +1 ngày: ngày `to` là NGUYÊN ngày cuối, bar kết thúc ở cuối ngày đó chứ không ở đầu.
  const toMs = isoToUtcMs(addDaysIso(to, 1));
  const span = Math.max(1, toMs - fromMs);
  const pct = (iso: string) => Math.min(100, Math.max(0, ((isoToUtcMs(iso) - fromMs) / span) * 100));

  // Vạch hôm nay đặt giữa ngày để nằm đúng trong ô ngày hôm nay.
  const todayMid = isoToUtcMs(today) + 43_200_000;
  const todayPct = todayMid >= fromMs && todayMid <= toMs ? ((todayMid - fromMs) / span) * 100 : null;

  return { from, to: utcMsToIso(toMs - 1), months: monthSegments(fromMs, toMs), todayPct, pct };
}
