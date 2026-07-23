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
export function monthIndex(date: string | null | undefined): number | null {
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
 * Chi phí thiết bị/vận hành theo mô hình GÁN THEO NGƯỜI (migration 0056). Hệ số theo `kind`
 * lấy từ costFactor: one_time ×1, monthly ×(số tháng), annual ×(số tháng/12):
 * - Khoản gán cho nhân sự: × số tháng người đó LÀM VIỆC trong cửa sổ (vào giữa chừng không
 *   gánh nguyên kỳ).
 * - Khoản gán cho dòng dự chi: × head_count, tính đủ cửa sổ (horizon) vì dự chi không có ngày vào/ra.
 * - Khoản KHÔNG gán cho ai (Văn phòng, Điện…): chi phí chung, tính đủ cửa sổ (horizon).
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
    // monthly + annual đều là chi phí vận hành ĐỊNH KỲ → gộp vào bucket `annual`
    // (thẻ "Chi phí vận hành" ở CostSummary). Chỉ one_time tách riêng.
    if (item.kind === 'one_time') oneTime += amount;
    else annual += amount;
  };

  for (const emp of employees) {
    const months = activeMonths(emp, anchor, horizon);
    for (const id of memberItemIds.get(emp.memberId) ?? []) {
      const it = byId.get(id);
      if (!it) continue; // khoản đã xoá còn sót id trong mảng — bỏ qua
      add(it, it.amount * costFactor(it.kind, months), 1);
    }
  }

  for (const p of projections) {
    for (const id of p.itemIds ?? []) {
      const it = byId.get(id);
      if (!it) continue;
      const each = it.amount * costFactor(it.kind, horizon);
      add(it, each * p.headCount, p.headCount);
    }
  }

  // Khoản chưa gán ai = chi phí CHUNG của dự án, tính một suất như trước 0056.
  for (const it of items) {
    if ((perItemCount.get(it.id) ?? 0) === 0) {
      add(it, it.amount * costFactor(it.kind, horizon), 0);
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
    sum += it.amount * costFactor(it.kind, months);
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

/* ===========================================================================
   ENGINE THEO TỪNG THÁNG (0059) — nguồn sự thật CHUNG cho thẻ tổng và tab Biểu đồ.
   Tính mọi bucket theo từng tháng trong cửa sổ rồi cộng lại: thẻ tổng = Σ series,
   nên hai chỗ không bao giờ lệch nhau.
   =========================================================================== */

/** Một bậc dự tính tăng lương: từ `effectiveFrom` lương thành `monthlySalary`. */
export interface PlanStep {
  effectiveFrom: string; // 'YYYY-MM-DD'
  monthlySalary: number;
}

export interface SeriesInput {
  employees: (SalaryLine & { memberId: string })[];
  /** memberId → các bậc tăng lương DỰ TÍNH (member_salary_plan). */
  plansByMember: Map<string, PlanStep[]>;
  items: CostItem[];
  memberItemIds: Map<string, string[]>;
  projections: CostProjection[];
  /** Thưởng Tết = `tetBonusMonths` THÁNG LƯƠNG (theo mức tại tháng trả), trả vào tháng
   *  dương `tetBonusMonth` (1-12) mỗi năm trong cửa sổ. 0 = tắt. */
  tetBonusMonths: number;
  tetBonusMonth: number;
  /** Doanh thu dự kiến: chỉ số tháng tuyệt đối → tiền. */
  revenueByMonth: Map<number, number>;
  anchor: number;
  horizon: number;
}

export interface CostSeries {
  /** Chỉ số tháng tuyệt đối của từng cột (anchor … anchor+horizon-1). */
  monthsIdx: number[];
  salary: number[];
  tet: number[];
  /** Thiết bị/vận hành gộp (ban đầu rơi vào tháng bắt đầu, định kỳ rải theo tháng). */
  overhead: number[];
  projection: number[];
  revenue: number[];
  totals: {
    salary: number;
    tet: number;
    oneTime: number;
    recurring: number;
    projection: number;
    revenue: number;
    /** Tổng CHI = lương + Tết + thiết bị/vận hành + dự chi. */
    grand: number;
    /** Lãi/lỗ = doanh thu − tổng chi. */
    profit: number;
  };
}

/** Nhãn 'MM/YYYY' của một chỉ số tháng tuyệt đối — trục X biểu đồ. */
export function monthLabel(idx: number): string {
  return `${String((idx % 12) + 1).padStart(2, '0')}/${Math.floor(idx / 12)}`;
}

/** Ngày ISO đầu tháng của một chỉ số tháng tuyệt đối — khoá dòng doanh thu. */
export function monthIso(idx: number): string {
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}-01`;
}

/** Lương của một người tại tháng `m`: bậc dự tính mới nhất có hiệu lực ≤ m, không có → mức hiện tại. */
function salaryAt(emp: SalaryLine, plans: PlanStep[] | undefined, m: number): number {
  let best = emp.monthlySalary;
  let bestIdx = -Infinity;
  for (const p of plans ?? []) {
    const mi = monthIndex(p.effectiveFrom);
    if (mi != null && mi <= m && mi > bestIdx) {
      bestIdx = mi;
      best = p.monthlySalary;
    }
  }
  return best;
}

function isActiveAt(emp: SalaryLine, m: number, anchor: number): boolean {
  const start = monthIndex(emp.startDate) ?? anchor;
  const end = monthIndex(emp.endDate);
  return start <= m && (end == null || m <= end);
}

export function buildCostSeries(inp: SeriesInput): CostSeries {
  const { employees, plansByMember, items, memberItemIds, projections, anchor, horizon } = inp;
  const n = Math.max(0, horizon);
  const monthsIdx = Array.from({ length: n }, (_, i) => anchor + i);
  const salary = new Array(n).fill(0);
  const tet = new Array(n).fill(0);
  const overhead = new Array(n).fill(0);
  const projectionArr = new Array(n).fill(0);
  const revenue = monthsIdx.map((m) => inp.revenueByMonth.get(m) ?? 0);
  const byId = new Map(items.map((i) => [i.id, i]));
  const assigned = new Set<string>();
  let oneTime = 0;

  /** Cộng một khoản thiết bị/vận hành vào tháng i, tách tổng one-time để hiện thẻ riêng. */
  const addItem = (i: number, item: CostItem, mult: number) => {
    const amt =
      (item.kind === 'one_time' ? item.amount : item.kind === 'annual' ? item.amount / 12 : item.amount) * mult;
    overhead[i] += amt;
    if (item.kind === 'one_time') oneTime += amt;
  };

  for (const emp of employees) {
    const plans = plansByMember.get(emp.memberId);
    const itemIds = memberItemIds.get(emp.memberId) ?? [];
    itemIds.forEach((id) => assigned.add(id));
    let chargedOneTime = false;
    for (let i = 0; i < n; i++) {
      const m = anchor + i;
      if (!isActiveAt(emp, m, anchor)) continue;
      const sal = salaryAt(emp, plans, m);
      salary[i] += sal;
      // Thưởng Tết: đúng tháng dương cấu hình, mỗi năm một lần, theo LƯƠNG TẠI THÁNG ĐÓ.
      if (inp.tetBonusMonths > 0 && (m % 12) + 1 === inp.tetBonusMonth) {
        tet[i] += sal * inp.tetBonusMonths;
      }
      for (const id of itemIds) {
        const it = byId.get(id);
        if (!it) continue;
        if (it.kind === 'one_time') {
          if (!chargedOneTime) addItem(i, it, 1); // sắm 1 lần ở tháng active đầu tiên
        } else {
          addItem(i, it, 1);
        }
      }
      chargedOneTime = true;
    }
  }

  for (const p of projections) {
    for (const id of p.itemIds ?? []) {
      const it = byId.get(id);
      if (!it) continue;
      assigned.add(id);
      if (it.kind === 'one_time') {
        if (n > 0) addItem(0, it, p.headCount);
      } else {
        for (let i = 0; i < n; i++) addItem(i, it, p.headCount);
      }
    }
    // Tiền mặt của dự chi (lương tuyển thêm / gói outsource) theo nhịp riêng.
    if (p.cadence === 'one_time') {
      if (n > 0) projectionArr[0] += p.amount * p.headCount;
    } else {
      const per = p.cadence === 'annual' ? (p.amount * p.headCount) / 12 : p.amount * p.headCount;
      for (let i = 0; i < n; i++) projectionArr[i] += per;
    }
  }

  // Khoản chưa gán ai = chi phí chung: one_time ở tháng đầu, định kỳ rải mọi tháng.
  for (const it of items) {
    if (assigned.has(it.id)) continue;
    if (it.kind === 'one_time') {
      if (n > 0) addItem(0, it, 1);
    } else {
      for (let i = 0; i < n; i++) addItem(i, it, 1);
    }
  }

  const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
  const totals = {
    salary: sum(salary),
    tet: sum(tet),
    oneTime,
    recurring: sum(overhead) - oneTime,
    projection: sum(projectionArr),
    revenue: sum(revenue),
    grand: sum(salary) + sum(tet) + sum(overhead) + sum(projectionArr),
    profit: sum(revenue) - (sum(salary) + sum(tet) + sum(overhead) + sum(projectionArr)),
  };

  return { monthsIdx, salary, tet, overhead, projection: projectionArr, revenue, totals };
}
