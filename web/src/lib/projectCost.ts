// Tính chi phí dự án — HÀM THUẦN (không side effect, dễ test). Mọi phép tính của tab
// "Chi phí" sống ở đây; component chỉ nạp dữ liệu rồi gọi các hàm này.
//
// Ngày nhân viên để dạng 'YYYY-MM-DD' và quy về CHỈ SỐ THÁNG tuyệt đối (year*12 + month)
// để cộng theo tháng mà không dính lệch múi giờ.

import type { CostCadence, CostItem, CostProjection } from '../types';

/** Đủ để tính lương: mức lương/tháng + khoảng thời gian làm (dạng 'YYYY-MM-DD'). */
export interface SalaryLine {
  monthlySalary: number;
  startDate: string | null;
  endDate: string | null;
}

/** 'YYYY-MM-DD' → chỉ số tháng tuyệt đối (year*12 + month0). null nếu rỗng/không hợp lệ. */
function monthIndex(date: string | null | undefined): number | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})/.exec(date);
  if (!m) return null;
  return Number(m[1]) * 12 + (Number(m[2]) - 1);
}

/** Tháng hiện tại dưới dạng chỉ số tuyệt đối (mốc mặc định khi chưa ai điền ngày). */
function currentMonthIndex(): number {
  const d = new Date();
  return d.getFullYear() * 12 + d.getMonth();
}

/**
 * Mốc bắt đầu cửa sổ tính lương = ngày start SỚM NHẤT trong danh sách nhân viên; nếu chưa
 * ai điền start thì lấy đầu tháng hiện tại. Cửa sổ xem là [anchor, anchor + horizon).
 */
export function anchorMonth(employees: SalaryLine[]): number {
  let min: number | null = null;
  for (const e of employees) {
    const mi = monthIndex(e.startDate);
    if (mi != null && (min == null || mi < min)) min = mi;
  }
  return min ?? currentMonthIndex();
}

/**
 * Số THÁNG một nhân viên còn active trong cửa sổ [anchor, anchor+horizon). Giao khoảng
 * [start, end] của người đó với cửa sổ. Không có start → coi như active từ anchor; không
 * có end → active tới hết cửa sổ. Nhờ vậy người vào/ra lệch nhau đều tính đúng.
 */
export function activeMonths(emp: SalaryLine, anchor: number, horizon: number): number {
  if (horizon <= 0) return 0;
  const start = monthIndex(emp.startDate) ?? anchor;
  const end = monthIndex(emp.endDate);
  const windowEnd = anchor + horizon - 1;
  const lo = Math.max(start, anchor);
  const hi = end == null ? windowEnd : Math.min(end, windowEnd);
  return Math.max(0, hi - lo + 1);
}

/** Tổng lương của cả dự án trong `horizon` tháng (cộng theo từng nhân viên × số tháng active). */
export function salaryTotal(employees: SalaryLine[], anchor: number, horizon: number): number {
  return employees.reduce((sum, e) => sum + e.monthlySalary * activeMonths(e, anchor, horizon), 0);
}

/**
 * Chi phí thiết bị/vận hành trong `horizon` tháng, tách rõ:
 * - `oneTime`: khoản ban đầu (đếm 1 lần, không phụ thuộc số tháng).
 * - `annual`: khoản theo năm, chia đều theo tháng (× horizon/12).
 * `per_employee` nhân khoản với số nhân sự (headcount).
 */
export function overheadTotal(
  items: CostItem[],
  headcount: number,
  horizon: number,
): { oneTime: number; annual: number; total: number } {
  let oneTime = 0;
  let annual = 0;
  for (const it of items) {
    const base = it.amount * (it.perEmployee ? headcount : 1);
    if (it.kind === 'one_time') oneTime += base;
    else annual += base * (horizon / 12);
  }
  return { oneTime, annual, total: oneTime + annual };
}

/** Thành tiền MỘT khoản chi phí thiết bị/vận hành trong `months` tháng (cho hiển thị dòng). */
export function overheadItemTotal(item: CostItem, headcount: number, months: number): number {
  const base = item.amount * (item.perEmployee ? headcount : 1);
  return item.kind === 'one_time' ? base : base * (months / 12);
}

/** Hệ số nhân theo nhịp trong `months` tháng: monthly→months, annual→months/12, one_time→1. */
export function costFactor(cadence: CostCadence, months: number): number {
  switch (cadence) {
    case 'monthly':
      return months;
    case 'annual':
      return months / 12;
    case 'one_time':
      return 1;
    default:
      return 0;
  }
}

/** Thành tiền một dòng dự chi trong `horizon` tháng: amount × số người × hệ số nhịp. */
export function projectionLineTotal(p: CostProjection, horizon: number): number {
  return p.amount * p.headCount * costFactor(p.cadence, horizon);
}

/** Tổng dự chi (tuyển thêm + outsource) trong `horizon` tháng. */
export function projectionTotal(projections: CostProjection[], horizon: number): number {
  return projections.reduce((sum, p) => sum + projectionLineTotal(p, horizon), 0);
}
