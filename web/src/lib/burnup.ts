// Dữ liệu vẽ đồ thị BURN-UP của một chart tốc độ: trục x = từng ngày lịch [start, end],
// ba đường (tiến độ thật · dự kiến theo tốc độ hiện tại · nhịp cần để kịp mốc) và các
// dải nghỉ. Thuần — không React, không Chart.js; component chỉ đổ số vào canvas.
//
// Đường phẳng qua T7/CN và lễ là CHỦ ĐÍCH: ngày nghỉ không cộng khối lượng, nhìn đồ thị
// thấy ngay "khúc này không phải chậm, là nghỉ".

import { isoToUtcMs, isWorkday, utcMsToIso } from './workdays';
import type { VelocityPlan } from './velocity';
import type { VelocityChart, VelocityProgress } from '../types';

/**
 * Nhật ký (số làm TRONG ngày, 0089) → chuỗi CỘNG DỒN theo ngày tăng dần — dạng buildBurnup
 * cần. Cùng ngày có nhiều mục (không xảy ra với khoá chart_id+day, nhưng mục dẫn xuất từ
 * task thì có thể) được gộp.
 */
export function cumulate(entries: VelocityProgress[]): VelocityProgress[] {
  const byDay = new Map<string, number>();
  for (const e of entries) byDay.set(e.day, (byDay.get(e.day) ?? 0) + e.doneQty);
  let cum = 0;
  return [...byDay.keys()].sort().map((day) => {
    cum += byDay.get(day) as number;
    return { chartId: entries[0]?.chartId ?? '', day, doneQty: cum, createdBy: null };
  });
}

export interface BurnupSeries {
  /** Từng ngày lịch trong [start, end] — cũng là nhãn trục x. */
  days: string[];
  /** Tiến độ thật: điểm tại các ngày có nhật ký (+ mốc 0 ở start, + hôm nay); null giữa các điểm để Chart.js nối thẳng. */
  actual: (number | null)[];
  /** Index các ngày có mục nhật ký — vẽ chấm ở đó. */
  loggedIdx: number[];
  /** Từ hôm nay theo tốc độ hiện tại, cộng mỗi ngày công, chặn ở tổng. null trước hôm nay. */
  projected: (number | null)[];
  /** Nhịp cần: phẳng ở mức đã làm trước hôm nay, tăng đều tới mốc, rồi phẳng ở tổng. */
  required: (number | null)[];
  /** Các quãng nghỉ (index đầu–cuối, bao gồm) — chuỗi ngày không công có CHỨA ít nhất một ngày lễ. */
  offRuns: { from: number; to: number }[];
  /** Index hôm nay trên trục; null khi hôm nay ngoài [start, end]. */
  todayIdx: number | null;
  /** Index mốc cần xong — chỉ khi đặt mốc RIÊNG (khác deadline). */
  aimIdx: number | null;
  deadlineIdx: number;
}

const DAY_MS = 86_400_000;
/** Trần số ngày vẽ — chart 5 năm là nhập nhầm, đừng đẻ hàng nghìn điểm. */
const MAX_DAYS = 2000;

function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  const end = isoToUtcMs(to);
  for (let ms = isoToUtcMs(from); ms <= end && out.length < MAX_DAYS; ms += DAY_MS) out.push(utcMsToIso(ms));
  return out;
}

/** Quãng nghỉ = chuỗi ngày không công liên tiếp; chỉ giữ quãng có lễ (cuối tuần thường thì thôi, tô hết là rối). */
function offRunsOf(days: string[], holidays: ReadonlySet<string>): { from: number; to: number }[] {
  const runs: { from: number; to: number }[] = [];
  let start = -1;
  let hasHoliday = false;
  const flush = (end: number) => {
    if (start >= 0 && hasHoliday) runs.push({ from: start, to: end });
    start = -1;
    hasHoliday = false;
  };
  days.forEach((d, i) => {
    if (isWorkday(d, holidays)) {
      flush(i - 1);
      return;
    }
    if (start < 0) start = i;
    if (holidays.has(d)) hasHoliday = true;
  });
  flush(days.length - 1);
  return runs;
}

/** `entries` phải là chuỗi CỘNG DỒN (qua `cumulate`) — mỗi mục = tổng tới hết ngày đó. */
export function buildBurnup(
  chart: VelocityChart,
  plan: VelocityPlan,
  entries: VelocityProgress[],
  holidays: ReadonlySet<string>,
  today: string,
): BurnupSeries {
  const days = dayRange(chart.startDate, chart.endDate);
  const n = days.length;
  const idxOf = new Map(days.map((d, i) => [d, i]));
  const deadlineIdx = n - 1;
  const todayIdx = idxOf.get(today) ?? null;
  // "Bây giờ" trên trục: trước start = chưa có gì (-1); sau end = kẹp ở deadline.
  const nowIdx = today < chart.startDate ? -1 : today > chart.endDate ? deadlineIdx : (todayIdx as number);
  const aimIdx = chart.targetDate ? idxOf.get(chart.targetDate) ?? null : null;

  const actual: (number | null)[] = Array(n).fill(null);
  const loggedIdx: number[] = [];
  if (nowIdx >= 0) {
    actual[0] = 0; // mốc xuất phát — bị đè nếu có nhật ký đúng ngày start
    for (const e of entries) {
      const i = idxOf.get(e.day);
      if (i === undefined || i > nowIdx) continue;
      actual[i] = e.doneQty;
      loggedIdx.push(i);
    }
    // Điểm hiện tại: doneQty đã = mục mới nhất (trigger 0086), kéo đường thật tới hôm nay.
    actual[nowIdx] = chart.doneQty;
  }

  const projected: (number | null)[] = Array(n).fill(null);
  if (nowIdx >= 0 && plan.currentVelocity !== null && plan.remainingQty > 0) {
    let v = chart.doneQty;
    projected[nowIdx] = v;
    for (let i = nowIdx + 1; i < n; i++) {
      if (isWorkday(days[i], holidays)) v = Math.min(chart.totalQty, v + plan.currentVelocity);
      projected[i] = v;
    }
  }

  const required: (number | null)[] = Array(n).fill(null);
  if (nowIdx >= 0 && plan.remainingQty > 0) {
    // Trước hôm nay: phẳng ở mức đã làm — đường cam "xuất phát" từ chỗ đang đứng.
    for (let i = 0; i <= nowIdx; i++) required[i] = chart.doneQty;
    const aimAt = aimIdx ?? deadlineIdx;
    if (plan.requiredPerDay !== null) {
      let v = chart.doneQty;
      for (let i = nowIdx + 1; i < n; i++) {
        if (i <= aimAt) {
          if (isWorkday(days[i], holidays)) v = Math.min(chart.totalQty, v + plan.requiredPerDay);
        } else {
          v = chart.totalQty;
        }
        required[i] = v;
      }
      // Làm tròn số thập phân có thể để hụt một tí ở mốc — ép đúng tổng tại mốc.
      if (aimAt > nowIdx) required[aimAt] = chart.totalQty;
    }
  }

  return {
    days,
    actual,
    loggedIdx,
    projected,
    required,
    offRuns: offRunsOf(days, holidays),
    todayIdx,
    aimIdx,
    deadlineIdx,
  };
}
