// Gom task theo bộ phận (job role của người nhận). Thuần — không React, không Supabase.
// Tách khỏi lib/sprint.ts vì file đó đã vượt giới hạn ~200 dòng.

import { STATUS_ORDER } from './sprint';
import {
  JOB_ROLES,
  JOB_ROLE_ICON,
  JOB_ROLE_LABEL,
  type Feature,
  type JobRole,
  type Task,
  type TeamMember,
} from '../types';

/** Bộ phận, hoặc 'unassigned' cho task chưa giao / người nhận chưa chọn chuyên môn. */
export type DeptBucket = JobRole | 'unassigned';

export interface DeptTaskGroup {
  key: DeptBucket;
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
 * Thứ tự mục bám theo JOB_ROLES để vị trí các bộ phận CỐ ĐỊNH giữa các sprint (sắp theo
 * số lượng thì mục sẽ nhảy chỗ mỗi lần đổi sprint, rất khó dùng). 'Chưa giao' luôn cuối.
 * Chỉ trả về mục có task.
 */
export function groupTasksByDept(tasks: Task[], members: TeamMember[]): DeptTaskGroup[] {
  const roleByUid = new Map(members.map((m) => [m.uid, m.jobRole]));
  const buckets = new Map<DeptBucket, Task[]>();

  for (const task of tasks) {
    const key: DeptBucket = (task.assigneeId && roleByUid.get(task.assigneeId)) || 'unassigned';
    const list = buckets.get(key);
    if (list) list.push(task);
    else buckets.set(key, [task]);
  }

  const order: DeptBucket[] = [...JOB_ROLES.map((r) => r.id), 'unassigned'];
  return order
    .filter((key) => (buckets.get(key)?.length ?? 0) > 0)
    .map((key) => {
      const list = [...(buckets.get(key) as Task[])].sort(byProgressThenOrder);
      return {
        key,
        icon: key === 'unassigned' ? '📥' : JOB_ROLE_ICON[key],
        label: key === 'unassigned' ? 'Chưa giao' : JOB_ROLE_LABEL[key],
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
