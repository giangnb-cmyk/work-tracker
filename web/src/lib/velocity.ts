// Kế hoạch tốc độ cho một chart Gantt (velocity_charts): từ khối lượng + khoảng ngày +
// đã làm → mỗi NGÀY CÔNG cần làm bao nhiêu, đang nhanh/chậm, dự kiến xong khi nào.
// Thuần — không React, không Supabase. Ngày công theo lib/workdays (bỏ T7/CN + lễ).
//
// QUY ƯỚC về "hôm nay" (theo cách đội nhìn đồ thị): tiến độ được ghi CUỐI ngày, nên
// hôm nay tính vào phần ĐÃ QUA (tốc độ đo = đã làm ÷ ngày công tới hết hôm nay), còn
// "cần mỗi ngày" chia cho các ngày công TỪ MAI tới mốc. Ví dụ 12 station tới 24/8 sau
// 6 ngày công = 2/ngày; còn 38 chia 6 ngày công (25/8 → 4/9, trừ lễ) = 6,33/ngày.

import { addDaysIso, countWorkdays, nthWorkdayFrom } from './workdays';
import type { VelocityChart } from '../types';

export type PlanStatus =
  | 'not_started' // chưa tới ngày bắt đầu
  | 'no_data' // chưa có tốc độ để so (chưa nhập, và chưa có ngày công nào trôi qua)
  | 'on_track'
  | 'behind' // chậm hơn nhịp cần — hoặc đã lỡ mốc cần xong (còn ngày tới deadline để bù)
  | 'overdue' // quá deadline mà còn việc
  | 'done';

export interface VelocityPlan {
  /** Mốc dùng để tính nhịp cần: `targetDate` nếu có, không thì `endDate` (deadline). */
  aimDate: string;
  /** Ngày công [start, mốc]. */
  totalWorkdays: number;
  /** Ngày công đã trôi qua tới HẾT hôm nay (quy ước ghi cuối ngày — xem đầu file). */
  elapsedWorkdays: number;
  /** Ngày công còn lại TỪ MAI tới mốc. */
  remainingWorkdays: number;
  /** Ngày công từ mai tới deadline (khác remainingWorkdays khi có mốc riêng). */
  workdaysToDeadline: number;
  remainingQty: number;
  /** Nhịp kế hoạch ban đầu: tổng ÷ ngày công [start, mốc]. */
  plannedPerDay: number;
  /** Mỗi ngày công còn lại phải làm bao nhiêu để kịp mốc. null = hết ngày công tới mốc mà còn việc. */
  requiredPerDay: number | null;
  /** Tốc độ ĐO được: đã làm ÷ ngày công đã qua. null khi chưa có ngày công nào. */
  measuredVelocity: number | null;
  /** Tốc độ dùng để so: người dùng nhập, không thì tốc độ đo. */
  currentVelocity: number | null;
  /** Theo nhịp kế hoạch, tới hôm nay đáng ra đã xong bao nhiêu. */
  expectedDoneQty: number;
  pctDone: number; // 0..1
  pctExpected: number; // 0..1
  /** Giữ tốc độ hiện tại thì xong ngày nào. null khi đã xong hoặc không có tốc độ. */
  projectedFinish: string | null;
  status: PlanStatus;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Tốc độ hiện tại ≥ 99.9% tốc độ cần → coi là kịp (né lỗi làm tròn số thập phân). */
const ON_TRACK_TOLERANCE = 0.999;

function statusOf(p: Omit<VelocityPlan, 'status'>, chart: VelocityChart, today: string): PlanStatus {
  if (chart.totalQty > 0 && p.remainingQty <= 0) return 'done';
  if (today < chart.startDate) return 'not_started';
  if (today > chart.endDate) return 'overdue';
  // Hết ngày công tới mốc mà còn việc: lỡ mốc rồi (deadline có thể chưa qua) → chậm.
  if (p.requiredPerDay === null) return 'behind';
  if (p.currentVelocity === null) return 'no_data';
  return p.currentVelocity >= p.requiredPerDay * ON_TRACK_TOLERANCE ? 'on_track' : 'behind';
}

export function computePlan(chart: VelocityChart, holidays: ReadonlySet<string>, today: string): VelocityPlan {
  const aimDate = chart.targetDate ?? chart.endDate;
  const totalWorkdays = countWorkdays(chart.startDate, aimDate, holidays);

  // Đã qua = [start, min(hôm nay, mốc)]; còn lại = [mai, mốc] (mai < start thì từ start).
  const elapsedTo = today < aimDate ? today : aimDate;
  const elapsedWorkdays = today < chart.startDate ? 0 : countWorkdays(chart.startDate, elapsedTo, holidays);
  const tomorrow = addDaysIso(today, 1);
  const remainFrom = tomorrow > chart.startDate ? tomorrow : chart.startDate;
  const remainingWorkdays = remainFrom > aimDate ? 0 : countWorkdays(remainFrom, aimDate, holidays);
  const workdaysToDeadline = remainFrom > chart.endDate ? 0 : countWorkdays(remainFrom, chart.endDate, holidays);

  const remainingQty = Math.max(0, chart.totalQty - chart.doneQty);
  const plannedPerDay = totalWorkdays > 0 ? chart.totalQty / totalWorkdays : 0;
  const requiredPerDay =
    remainingQty <= 0 ? 0 : remainingWorkdays > 0 ? remainingQty / remainingWorkdays : null;
  const measuredVelocity = elapsedWorkdays > 0 ? chart.doneQty / elapsedWorkdays : null;
  const currentVelocity = chart.velocity ?? measuredVelocity;
  const expectedDoneQty = Math.min(chart.totalQty, plannedPerDay * elapsedWorkdays);

  let projectedFinish: string | null = null;
  if (remainingQty > 0 && currentVelocity && currentVelocity > 0) {
    projectedFinish = nthWorkdayFrom(remainFrom, Math.ceil(remainingQty / currentVelocity), holidays);
  }

  const partial = {
    aimDate,
    totalWorkdays,
    elapsedWorkdays,
    remainingWorkdays,
    workdaysToDeadline,
    remainingQty,
    plannedPerDay,
    requiredPerDay,
    measuredVelocity,
    currentVelocity,
    expectedDoneQty,
    pctDone: chart.totalQty > 0 ? clamp01(chart.doneQty / chart.totalQty) : 0,
    pctExpected: chart.totalQty > 0 ? clamp01(expectedDoneQty / chart.totalQty) : 0,
    projectedFinish,
  };
  return { ...partial, status: statusOf(partial, chart, today) };
}

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  not_started: 'Chưa bắt đầu',
  no_data: 'Chưa có tốc độ',
  on_track: 'Kịp tiến độ',
  behind: 'Đang chậm',
  overdue: 'Quá hạn',
  done: 'Hoàn thành',
};

/** Số khối lượng/tốc độ: tối đa 2 chữ số lẻ, bỏ .00 — "3", "2,5", "0,33". */
export function fmtQty(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}
