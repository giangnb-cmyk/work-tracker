// Xuất bảng chi phí ra Google Sheet (0060). Web TÍNH SẴN toàn bộ số (engine buildCostSeries
// — một nguồn sự thật, không nhân đôi công thức sang Python) rồi xếp yêu cầu vào
// cost_export_requests; bot chỉ việc ghi vào sheet đã cấu hình (projects.cost_sheet_id).

import { supabase } from '../supabase';
import { formatIsoDate } from './format';
import {
  activeMonths,
  employerBhxh,
  monthLabel,
  overheadForEmployee,
  projectionLineTotal,
  type CostSeries,
  type OverheadResult,
} from './projectCost';
import {
  COST_CADENCE_LABEL,
  COST_ITEM_KIND_LABEL,
  COST_PROJECTION_KIND_LABEL,
  JOB_ROLE_LABEL,
  type CostEmployeeRow,
  type CostItem,
  type CostProjection,
} from '../types';

/** Một khối trong sheet: tiêu đề + các hàng (chuỗi/số thô — Sheets tự định dạng). */
export interface ExportSection {
  name: string;
  rows: (string | number)[][];
}

export interface ExportPayload {
  tab: string;
  sections: ExportSection[];
}

interface BuildArgs {
  projectName: string;
  anchor: number;
  months: number;
  series: CostSeries;
  employees: CostEmployeeRow[];
  itemById: Map<string, CostItem>;
  memberItemIds: Map<string, string[]>;
  items: CostItem[];
  overhead: OverheadResult;
  projections: CostProjection[];
}

/** Dựng payload đầy đủ 5 khối: tổng quan, theo tháng, nhân sự, thiết bị/vận hành, dự chi. */
export function buildCostExportPayload(a: BuildArgs): ExportPayload {
  const { series, months } = a;
  const t = series.totals;
  const span = `${monthLabel(a.anchor)} → ${monthLabel(a.anchor + months - 1)} (${months} tháng)`;

  const overview: (string | number)[][] = [
    ['Dự án', a.projectName],
    ['Khoảng tính', span],
    ['Xuất lúc', new Date().toLocaleString('vi-VN')],
    ['Tổng lương', t.salary],
    ['Thưởng Tết', t.tet],
    ['BHXH Cty đóng', t.insurance],
    ['Chi phí ban đầu (1 lần)', t.oneTime],
    ['Chi phí vận hành', t.recurring],
    ['Dự chi', t.projection],
    ['TỔNG CHI', t.grand],
    ['Doanh thu dự kiến', t.revenue],
    ['Lãi / Lỗ', t.profit],
  ];

  const monthly: (string | number)[][] = [
    ['Tháng', 'Lương', 'Thưởng Tết', 'BHXH (Cty)', 'TB & VH', 'Dự chi', 'Tổng chi', 'Doanh thu', 'Lãi / Lỗ'],
    ...series.monthsIdx.map((m, i) => {
      const chi = series.salary[i] + series.tet[i] + series.insurance[i] + series.overhead[i] + series.projection[i];
      return [
        monthLabel(m),
        series.salary[i],
        series.tet[i],
        series.insurance[i],
        series.overhead[i],
        series.projection[i],
        chi,
        series.revenue[i],
        series.revenue[i] - chi,
      ];
    }),
    ['TỔNG', t.salary, t.tet, t.insurance, t.oneTime + t.recurring, t.projection, t.grand, t.revenue, t.profit],
  ];

  const people: (string | number)[][] = [
    ['Nhân viên', 'Chuyên môn', 'Lương / tháng', 'BHXH (Cty) / th', 'Bắt đầu', 'Kết thúc', 'Số tháng', 'TB & VH', 'Thành tiền'],
    ...a.employees.map((e) => {
      const active = activeMonths(e, a.anchor, months);
      const gear = overheadForEmployee(a.memberItemIds.get(e.memberId) ?? [], a.itemById, active);
      const bhxh = employerBhxh(e.monthlySalary);
      return [
        e.name,
        e.jobRole ? JOB_ROLE_LABEL[e.jobRole] : '',
        e.monthlySalary,
        bhxh,
        formatIsoDate(e.startDate),
        e.endDate ? formatIsoDate(e.endDate) : '—',
        active,
        gear,
        (e.monthlySalary + bhxh) * active + gear,
      ];
    }),
  ];

  const gear: (string | number)[][] = [
    ['Khoản mục', 'Số tiền', 'Loại', 'Suất đang gán', 'Thành tiền'],
    ...a.items.map((it) => [
      it.name,
      it.amount,
      COST_ITEM_KIND_LABEL[it.kind],
      a.overhead.perItemCount.get(it.id) ?? 0,
      a.overhead.perItem.get(it.id) ?? 0,
    ]),
  ];

  const proj: (string | number)[][] = [
    ['Loại', 'Mô tả', 'Số tiền', 'Nhịp', 'Số người', 'Thành tiền', 'BHXH Cty'],
    ...a.projections.map((p) => [
      COST_PROJECTION_KIND_LABEL[p.kind],
      p.label,
      p.amount,
      COST_CADENCE_LABEL[p.cadence],
      p.headCount,
      projectionLineTotal(p, months),
      p.kind === 'hire' && p.cadence === 'monthly' ? employerBhxh(p.amount) * p.headCount * months : 0,
    ]),
  ];

  return {
    tab: 'Chi phí (auto)',
    sections: [
      { name: '📌 TỔNG QUAN', rows: overview },
      { name: '📆 THEO THÁNG', rows: monthly },
      { name: '👥 CHI PHÍ NHÂN SỰ', rows: people },
      { name: '🖥️ THIẾT BỊ & VẬN HÀNH', rows: gear },
      { name: '🔮 DỰ CHI', rows: proj },
    ],
  };
}

/** sections → một mảng hàng phẳng: [TÊN KHỐI] + rows + dòng trống ngăn cách (ghi vào tab). */
export function flattenPayload(payload: ExportPayload): (string | number)[][] {
  const out: (string | number)[][] = [];
  for (const sec of payload.sections) {
    out.push([sec.name]);
    out.push(...sec.rows);
    out.push([]);
  }
  return out;
}

/** Xếp yêu cầu xuất vào hàng đợi — trả về id để theo dõi trạng thái. */
export async function requestCostExport(
  projectId: string,
  payload: ExportPayload,
  requestedBy: string | null,
): Promise<string> {
  const { data, error } = await supabase
    .from('cost_export_requests')
    .insert({ project_id: projectId, payload, requested_by: requestedBy })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Trạng thái hiện tại của một yêu cầu xuất. */
export async function fetchExportStatus(id: string): Promise<{ status: string; result: string } | null> {
  const { data, error } = await supabase
    .from('cost_export_requests')
    .select('status, result')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? { status: data.status as string, result: (data.result as string) ?? '' } : null;
}
