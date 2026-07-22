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

/**
 * Mốc bắt đầu cửa sổ tính = THÁNG HIỆN TẠI; slider N tháng = chi phí N tháng TỚI
 * [tháng này, tháng này + N).
 *
 * Trước đây neo vào ngày start SỚM NHẤT trong danh sách — sai thực tế và đã cắn: một người
 * vào từ 2022 là cả cửa sổ trôi về 2022, mọi người vào 2025–2026 rơi ra ngoài và cả bảng
 * hiện "Số tháng 0 · 0 ₫" trừ đúng người cũ nhất. Người vào TRƯỚC tháng này vẫn tính đủ N
 * tháng (activeMonths giao khoảng); người vào GIỮA cửa sổ chỉ tính từ tháng họ vào.
 */
export function anchorMonth(): number {
  const d = new Date();
  return d.getFullYear() * 12 + d.getMonth();
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

export interface OverheadInput {
  items: CostItem[];
  /** Nhân sự của dự án (đủ start/end để tính số tháng làm việc trong cửa sổ). */
  employees: (SalaryLine & { memberId: string })[];
  /** memberId → các khoản đã gán (popup multi-select). */
  memberItemIds: Map<string, string[]>;
  projections: CostProjection[];
  anchor: number;
  horizon: number;
}

export interface OverheadResult {
  oneTime: number;
  annual: number;
  total: number;
  /** Thành tiền TỪNG khoản (đã gộp mọi lượt gán; chưa gán = 1 lần cho dự án). */
  perItem: Map<string, number>;
  /** Số "suất" đang gán mỗi khoản (người thật + head_count dự chi) — cột "Đang gán". */
  perItemCount: Map<string, number>;
}

/**
 * Chi phí thiết bị/vận hành theo mô hình GÁN THEO NGƯỜI (migration 0056):
 * - Khoản gán cho nhân sự: one_time đếm 1 lần/người; annual × (số tháng người đó LÀM VIỆC
 *   trong cửa sổ / 12) — người vào giữa chừng không gánh nguyên năm.
 * - Khoản gán cho dòng dự chi: × head_count; annual tính đủ cửa sổ (× horizon/12) vì dự chi
 *   không có ngày vào/ra.
 * - Khoản KHÔNG gán cho ai (Văn phòng, Điện…): chi phí chung — 1 lần, hoặc annual × horizon/12.
 */
export function overheadTotal(inp: OverheadInput): OverheadResult {
  const { items, employees, memberItemIds, projections, anchor, horizon } = inp;
  const byId = new Map(items.map((i) => [i.id, i]));
  const perItem = new Map(items.map((i) => [i.id, 0]));
  const perItemCount = new Map(items.map((i) => [i.id, 0]));
  let oneTime = 0;
  let annual = 0;

  const add = (item: CostItem, amount: number, seats: number) => {
    perItem.set(item.id, (perItem.get(item.id) ?? 0) + amount);
    perItemCount.set(item.id, (perItemCount.get(item.id) ?? 0) + seats);
    if (item.kind === 'one_time') oneTime += amount;
    else annual += amount;
  };

  for (const emp of employees) {
    const months = activeMonths(emp, anchor, horizon);
    for (const id of memberItemIds.get(emp.memberId) ?? []) {
      const it = byId.get(id);
      if (!it) continue; // khoản đã xoá còn sót id trong mảng — bỏ qua
      add(it, it.kind === 'one_time' ? it.amount : it.amount * (months / 12), 1);
    }
  }

  for (const p of projections) {
    for (const id of p.itemIds ?? []) {
      const it = byId.get(id);
      if (!it) continue;
      const each = it.kind === 'one_time' ? it.amount : it.amount * (horizon / 12);
      add(it, each * p.headCount, p.headCount);
    }
  }

  // Khoản chưa gán ai = chi phí CHUNG của dự án, tính một suất như trước 0056.
  for (const it of items) {
    if ((perItemCount.get(it.id) ?? 0) === 0) {
      add(it, it.kind === 'one_time' ? it.amount : it.amount * (horizon / 12), 0);
    }
  }

  return { oneTime, annual, total: oneTime + annual, perItem, perItemCount };
}

/** Tổng thiết bị/vận hành của MỘT người trong `months` tháng làm việc (hiện ở bảng lương). */
export function overheadForEmployee(
  itemIds: string[],
  itemById: Map<string, CostItem>,
  months: number,
): number {
  let sum = 0;
  for (const id of itemIds) {
    const it = itemById.get(id);
    if (!it) continue;
    sum += it.kind === 'one_time' ? it.amount : it.amount * (months / 12);
  }
  return sum;
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
