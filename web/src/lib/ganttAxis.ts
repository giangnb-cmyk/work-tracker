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
  /** "T9" — dùng khi ô tháng hẹp (trục dài nhiều tháng) để chữ không bị cắt thành "Th 1:". */
  short: string;
  leftPct: number;
  widthPct: number;
}

/** Khung thời gian người dùng chọn (ISO, cả hai đầu NGUYÊN ngày). */
export interface AxisWindow {
  from: string;
  to: string;
}

export interface GanttAxis {
  from: string;
  to: string;
  /** true = trục đang theo khung người chọn (bar có thể bị cắt hai đầu), false = ôm hết chart. */
  windowed: boolean;
  months: AxisMonth[];
  /** Vị trí hôm nay (0..100). null nếu hôm nay rơi ngoài trục — không xảy ra vì trục luôn ôm hôm nay. */
  todayPct: number | null;
  /** Vị trí (0..100) của một ngày trên trục — kẹp trong biên. */
  pct: (iso: string) => number;
  /**
   * Vị trí KHÔNG kẹp (âm hoặc >100 khi ngày nằm ngoài khung) — cho hình học bar: bar vẽ
   * đúng độ dài thật rồi để track cắt phần thừa, nhờ vậy phần "đã làm" và vạch "đáng ra"
   * vẫn đúng tỉ lệ khi bar bị cắt (kẹp mép rồi tô % lên phần còn lại sẽ sai).
   */
  rawPct: (iso: string) => number;
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

function monthShort(ms: number): string {
  return `T${new Date(ms).getUTCMonth() + 1}`;
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
        short: monthShort(cursor),
        leftPct: ((segFrom - fromMs) / span) * 100,
        widthPct: ((segTo - segFrom) / span) * 100,
      });
    }
    cursor = next;
  }
  return out;
}

/**
 * Trục chung. Không có `window`: ôm hết mọi chart + hôm nay (đệm PAD_DAYS). Có `window`
 * (người dùng chọn khoảng để phóng to): trục đúng bằng khung, bar ngoài khung bị `pct` kẹp
 * về mép — GanttRow đánh dấu phần bị cắt. Nhờ vậy 1 chart kéo dài cả năm không bóp các
 * chart 1 tháng thành vạch mỏng.
 */
export function buildAxis(spans: Span[], today: string, window?: AxisWindow | null): GanttAxis {
  let from: string;
  let to: string;
  if (window) {
    from = window.from <= window.to ? window.from : window.to;
    to = window.from <= window.to ? window.to : window.from;
  } else if (spans.length === 0) {
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
  const rawPct = (iso: string) => ((isoToUtcMs(iso) - fromMs) / span) * 100;
  const pct = (iso: string) => Math.min(100, Math.max(0, rawPct(iso)));

  // Vạch hôm nay đặt giữa ngày để nằm đúng trong ô ngày hôm nay.
  const todayMid = isoToUtcMs(today) + 43_200_000;
  const todayPct = todayMid >= fromMs && todayMid <= toMs ? ((todayMid - fromMs) / span) * 100 : null;

  return { from, to: utcMsToIso(toMs - 1), windowed: Boolean(window), months: monthSegments(fromMs, toMs), todayPct, pct, rawPct };
}
