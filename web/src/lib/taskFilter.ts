// Logic lọc task — THUẦN, không React, để test được độc lập.
// (Khác matchBug vốn còn nằm trong component; miền task tách ra vì luật OR/AND ở đây dễ
// sai theo kiểu im lặng: sai thì ra danh sách rỗng chứ không nổ lỗi.)

import type { FilterToken } from '../components/TokenFilterBar';
import type { Task } from '../types';

export type TaskFacet = 'status' | 'priority' | 'assignee' | 'reporter' | 'feature';
export type TaskFilterToken = FilterToken<TaskFacet>;

/** Giá trị đặc biệt của facet người: không phải uid. */
const NONE = 'none';
const ANY = 'any';
const ME = 'me';

function matchPerson(uid: string | null, values: string[], meId: string): boolean {
  return values.some((v) =>
    v === NONE ? !uid : v === ANY ? !!uid : v === ME ? uid === meId : uid === v,
  );
}

/**
 * Task có qua HẾT mọi token đang bật không? (giữa các token là AND)
 *
 * @param meId uid người đang đăng nhập — cho giá trị 'me'.
 */
export function matchTask(t: Task, tokens: TaskFilterToken[], meId: string): boolean {
  return tokens.every((tk) => {
    let hit: boolean;
    switch (tk.facet) {
      case 'status':
        hit = tk.values.includes(t.status);
        break;
      case 'priority':
        hit = tk.values.includes(t.priority);
        break;
      // OR chứ không AND: một task chỉ thuộc ĐÚNG MỘT feature, hiểu theo AND thì chọn hai
      // feature là luôn ra rỗng — vô nghĩa với người dùng. Cùng lý do với version bên bug.
      case 'feature':
        hit = tk.values.some((v) => (v === NONE ? !t.featureId : t.featureId === v));
        break;
      case 'assignee':
        hit = matchPerson(t.assigneeId, tk.values, meId);
        break;
      case 'reporter':
        hit = matchPerson(t.reporterId, tk.values, meId);
        break;
    }
    return tk.op === 'is' ? hit : !hit;
  });
}
