// Chart tốc độ LINK với task (migration 0087/0088): dẫn xuất "đã xong", "tổng" và đường
// tiến độ thật từ task trong phạm vi, thay cho nhập tay + nhật ký. Thuần — không React.
//
// Phạm vi = (task theo feature | task_ids chọn từ phía chart) ∪ task có `chartId` trỏ về chart
// (gắn từ chi tiết task, 0088). Trọng số khi đếm 'tasks' = `chartQty` của task (NULL = 1) —
// "task này tương đương 3 model"; đếm 'points' = story points.
//
// Ngày hoàn thành của task = `dueDate` khi task đã done (updateTask/moveTask ghi ngày xong
// thật vào đó — xem DATA_MODEL "dueDate reset to done-day"). Không có ngày thì tính vào
// ngày bắt đầu chart; xong sau hôm nay (dữ liệu lệch giờ) thì kẹp về hôm nay.

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

/**
 * Chart lấy tiến độ từ task? = nguồn đặt là feature/tasks, HOẶC có task gắn từ chi tiết task.
 * Chart "nhập tay" mà ai đó gắn task vào thì từ đó chạy theo task — người gắn muốn thế, và
 * hai nguồn (nhật ký tay + task) cùng lúc thì không biết tin bên nào.
 */
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
  doneQty: number;
  /** `totalQty` kế hoạch nếu chart đặt > 0, không thì tổng khối lượng task trong phạm vi. */
  totalQty: number;
  /** Mục nhật ký TỔNG HỢP theo ngày xong (cộng dồn) — đổ thẳng vào buildBurnup như nhật ký tay. */
  entries: VelocityProgress[];
  scope: Task[];
  doneTasks: Task[];
}

export function deriveLinked(chart: VelocityChart, tasks: Task[], today: string): LinkedProgress {
  const scope = tasksInScope(chart, tasks);
  const doneTasks = scope.filter((t) => t.status === 'done');
  const derivedTotal = scope.reduce((s, t) => s + weightOf(chart, t), 0);
  const doneQty = doneTasks.reduce((s, t) => s + weightOf(chart, t), 0);

  // Gom theo ngày xong, kẹp vào [start, hôm nay], rồi cộng dồn theo thứ tự ngày.
  const byDay = new Map<string, number>();
  for (const t of doneTasks) {
    const d = t.dueDate?.toDate();
    let day = d ? localIso(d) : chart.startDate;
    if (day < chart.startDate) day = chart.startDate;
    if (day > today) day = today;
    byDay.set(day, (byDay.get(day) ?? 0) + weightOf(chart, t));
  }
  let cum = 0;
  const entries: VelocityProgress[] = [...byDay.keys()].sort().map((day) => {
    cum += byDay.get(day) as number;
    return { chartId: chart.id, day, doneQty: cum, createdBy: null };
  });

  return { doneQty, totalQty: chart.totalQty > 0 ? chart.totalQty : derivedTotal, entries, scope, doneTasks };
}

/** Chart với số liệu HIỆU LỰC: link thì thay doneQty/totalQty bằng dẫn xuất; nhập tay giữ nguyên. */
export function applyLink(chart: VelocityChart, tasks: Task[], today: string): VelocityChart {
  if (!isLinked(chart, tasks)) return chart;
  const { doneQty, totalQty } = deriveLinked(chart, tasks, today);
  return { ...chart, doneQty, totalQty };
}

/** Nhãn ngắn cho nguồn tiến độ, vd "tự động từ feature Shop" / "tự động từ 12 task". null = nhập tay. */
export function linkLabel(chart: VelocityChart, features: Feature[], tasks: Task[] = []): string | null {
  if (!isLinked(chart, tasks)) return null;
  const attached = attachedTasks(chart, tasks);
  if (chart.linkKind === 'feature') {
    const f = features.find((x) => x.id === chart.featureId);
    const extra = attached.length > 0 ? ` (+${attached.length} task gắn từ chi tiết)` : '';
    return f ? `tự động từ feature ${f.name}${extra}` : `feature đã bị xoá${extra}`;
  }
  if (chart.linkKind === 'tasks') {
    return `tự động từ ${new Set([...chart.taskIds, ...attached.map((t) => t.id)]).size} task`;
  }
  return `tự động từ ${attached.length} task gắn từ chi tiết`;
}
