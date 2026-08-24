// Gom task theo bộ phận (job role của người nhận). Thuần — không React, không Supabase.
// Tách khỏi lib/sprint.ts vì file đó đã vượt giới hạn ~200 dòng.

import { STATUS_ORDER } from './sprint';
import { deptOrder, memberRoleResolver } from './memberRole';
import type { Feature, Task, TeamMember, TeamRole } from '../types';

export interface DeptTaskGroup {
  /** Khoá của memberRole (`role:<id>` | JobRole cũ) hoặc 'unassigned'. */
  key: string;
  icon: string;
  label: string;
  tasks: Task[];
  done: number;
}

/** Chưa xong lên trước (theo bậc trạng thái), rồi tới thứ tự thủ công. */
function byProgressThenOrder(a: Task, b: Task): number {
  return (
    STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || (a.order ?? 0) - (b.order ?? 0)
  );
}

/** Cùng thứ tự với các mục theo bộ phận, để mọi danh sách task đọc như một. Không sửa mảng gốc. */
export function sortTasksByProgress(tasks: Task[]): Task[] {
  return [...tasks].sort(byProgressThenOrder);
}

/**
 * Gom task thành các mục theo bộ phận, đã sắp sẵn — thay cho việc bắt người dùng tự lọc.
 *
 * Bộ phận = chuyên môn của NGƯỜI NHẬN theo `memberRoleResolver`: role động (0072) trước,
 * enum jobRole cũ cho ai chưa chọn — role admin mới tạo thành mục riêng đúng tên/icon
 * thay vì bị ép về enum cũ qua legacy_job_role. Thứ tự mục theo `deptOrder` để vị trí
 * CỐ ĐỊNH giữa các sprint; 'Chưa giao' luôn cuối. Chỉ trả về mục có task.
 */
export function groupTasksByDept(
  tasks: Task[],
  members: TeamMember[],
  roles: TeamRole[],
): DeptTaskGroup[] {
  const roleOf = memberRoleResolver(members, roles);
  const buckets = new Map<string, Task[]>();

  for (const task of tasks) {
    const key = (task.assigneeId && roleOf(task.assigneeId)?.key) || 'unassigned';
    const list = buckets.get(key);
    if (list) list.push(task);
    else buckets.set(key, [task]);
  }

  const order = [...deptOrder(roles), { key: 'unassigned', icon: '📥', label: 'Chưa giao' }];
  return order
    .filter((d) => (buckets.get(d.key)?.length ?? 0) > 0)
    .map((d) => {
      const list = [...(buckets.get(d.key) as Task[])].sort(byProgressThenOrder);
      return {
        key: d.key,
        icon: d.icon,
        label: d.label,
        tasks: list,
        done: list.filter((t) => t.status === 'done').length,
      };
    });
}

/** Mục "theo feature": `feature` null = rổ task chưa gắn feature. */
export interface FeatureTaskGroup {
  key: string;
  feature: Feature | null;
  tasks: Task[];
  done: number;
}

/** Rổ cho task chưa gắn feature — đứng cuối, và chỉ hiện khi thật sự có task. */
export const NO_FEATURE_KEY = '__none__';

/**
 * Gom task theo feature, giữ nguyên thứ tự `features` truyền vào.
 *
 * Trả về CẢ feature chưa có task nào — hàm này không biết mục rỗng nên hiện hay ẩn (bảng
 * sprint thì ẩn, một màn "chọn feature" thì phải hiện). Bên gọi tự lọc `tasks.length`.
 */
export function groupTasksByFeature(tasks: Task[], features: Feature[]): FeatureTaskGroup[] {
  const buckets = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = task.featureId ?? NO_FEATURE_KEY;
    const list = buckets.get(key);
    if (list) list.push(task);
    else buckets.set(key, [task]);
  }

  const toGroup = (key: string, feature: Feature | null): FeatureTaskGroup => {
    const list = [...(buckets.get(key) ?? [])].sort(byProgressThenOrder);
    return { key, feature, tasks: list, done: list.filter((t) => t.status === 'done').length };
  };

  const groups = features.map((f) => toGroup(f.id, f));
  if ((buckets.get(NO_FEATURE_KEY)?.length ?? 0) > 0) groups.push(toGroup(NO_FEATURE_KEY, null));
  return groups;
}
