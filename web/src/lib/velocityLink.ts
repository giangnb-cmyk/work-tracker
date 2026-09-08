// Chart tốc độ LINK với task (migration 0087/0088): cộng thêm khối lượng từ task vào tiến độ
// của chart. Thuần — không React, không Supabase.
//
// HAI NGUỒN CỘNG DỒN, không thay thế nhau:
//   • phần ĐIỀN TAY = nhật ký theo ngày (velocity_charts.done_qty = SUM nhật ký, trigger 0089);
//   • phần TASK   = Σ khối lượng các task ĐÃ XONG trong phạm vi.
// Người dùng gắn task vào chart mà mất phần đã gõ tay là sai (đã bị báo) — việc chưa lập
// task vẫn phải đếm được. Đã làm hiệu lực = tay + task; đường thật = gộp nhật ký + ngày xong task.
//
// Phạm vi task = (theo feature | task_ids chọn từ phía chart) ∪ task có `chartId` trỏ về chart
// (gắn từ chi tiết task, 0088). Trọng số đếm 'tasks' = `chartQty` của task (NULL = 1) —
// "task này tương đương 3 model"; đếm 'points' = story points.
//
// Ngày hoàn thành của task = `dueDate` khi task đã done (updateTask/moveTask ghi ngày xong
// thật vào đó). Không có ngày thì tính vào ngày bắt đầu chart; xong sau hôm nay thì kẹp về hôm nay.

import type { Feature, Task, VelocityChart, VelocityProgress } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');
/** Date local → 'YYYY-MM-DD' (cùng cách với todayIso: theo giờ máy, không qua UTC). */
function localIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Task gắn vào chart từ chi tiết task (tasks.chart_id, 0088). */
export function attachedTasks(chart: Pick<VelocityChart, 'id'>, tasks: Task[]): Task[] {
  return tasks.filter((t) => t.chartId === chart.id);
}

/** Chart có nguồn task? = nguồn đặt là feature/tasks, HOẶC có task gắn từ chi tiết task. */
export function isLinked(chart: Pick<VelocityChart, 'id' | 'linkKind'>, tasks: Task[]): boolean {
  return chart.linkKind !== 'manual' || attachedTasks(chart, tasks).length > 0;
}

/** Task nằm trong phạm vi của chart: theo feature / task_ids của chart ∪ task gắn từ chi tiết. */
export function tasksInScope(chart: VelocityChart, tasks: Task[]): Task[] {
  if (!isLinked(chart, tasks)) return [];
  const picked = new Set(chart.linkKind === 'tasks' ? chart.taskIds : []);
  return tasks.filter(
    (t) =>
      t.chartId === chart.id ||
      picked.has(t.id) ||
      (chart.linkKind === 'feature' && chart.featureId !== null && t.featureId === chart.featureId),
  );
}

/** Khối lượng một task đóng góp vào chart: điểm, hoặc số đơn vị tự khai (mặc định 1). */
export function weightOf(chart: Pick<VelocityChart, 'countBy'>, t: Task): number {
  if (chart.countBy === 'points') return t.points || 0;
  return t.chartQty ?? 1;
}

export interface LinkedProgress {
  /** Phần điền tay (= chart.doneQty, SUM nhật ký). */
  manualDone: number;
  /** Phần từ task đã xong trong phạm vi. */
  taskDone: number;
  /** Đã làm hiệu lực = manualDone + taskDone. */
  doneQty: number;
  /** `totalQty` kế hoạch nếu chart đặt > 0; không thì Σ khối lượng task trong phạm vi + phần điền tay. */
  totalQty: number;
  /** Khối lượng task xong THEO NGÀY (chưa cộng dồn) — gộp với nhật ký tay rồi `cumulate` để vẽ. */
  entries: VelocityProgress[];
  scope: Task[];
  doneTasks: Task[];
}

export function deriveLinked(chart: VelocityChart, tasks: Task[], today: string): LinkedProgress {
  const scope = tasksInScope(chart, tasks);
  const doneTasks = scope.filter((t) => t.status === 'done');
  const taskTotal = scope.reduce((s, t) => s + weightOf(chart, t), 0);
  const taskDone = doneTasks.reduce((s, t) => s + weightOf(chart, t), 0);
  const manualDone = chart.doneQty;

  // Khối lượng xong theo ngày, kẹp vào [start, hôm nay]; cùng ngày thì gộp.
  const byDay = new Map<string, number>();
  for (const t of doneTasks) {
    const d = t.dueDate?.toDate();
    let day = d ? localIso(d) : chart.startDate;
    if (day < chart.startDate) day = chart.startDate;
    if (day > today) day = today;
    byDay.set(day, (byDay.get(day) ?? 0) + weightOf(chart, t));
  }
  const entries: VelocityProgress[] = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, qty]) => ({ chartId: chart.id, day, doneQty: qty, createdBy: null }));

  return {
    manualDone,
    taskDone,
    doneQty: manualDone + taskDone,
    totalQty: chart.totalQty > 0 ? chart.totalQty : taskTotal + manualDone,
    entries,
    scope,
    doneTasks,
  };
}

/** Chart với số liệu HIỆU LỰC: có nguồn task thì doneQty = tay + task, totalQty theo luật trên; không thì giữ nguyên. */
export function applyLink(chart: VelocityChart, tasks: Task[], today: string): VelocityChart {
  if (!isLinked(chart, tasks)) return chart;
  const { doneQty, totalQty } = deriveLinked(chart, tasks, today);
  return { ...chart, doneQty, totalQty };
}

/** Nhãn ngắn cho nguồn task, vd "task của feature Shop" / "12 task". null = không có nguồn task. */
export function linkLabel(chart: VelocityChart, features: Feature[], tasks: Task[] = []): string | null {
  if (!isLinked(chart, tasks)) return null;
  const attached = attachedTasks(chart, tasks);
  if (chart.linkKind === 'feature') {
    const f = features.find((x) => x.id === chart.featureId);
    const extra = attached.length > 0 ? ` (+${attached.length} task gắn từ chi tiết)` : '';
    return f ? `task của feature ${f.name}${extra}` : `feature đã bị xoá${extra}`;
  }
  if (chart.linkKind === 'tasks') {
    return `${new Set([...chart.taskIds, ...attached.map((t) => t.id)]).size} task đã chọn`;
  }
  return `${attached.length} task gắn từ chi tiết`;
}
