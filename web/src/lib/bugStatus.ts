// Bug status ↔ workflow label. The Kanban column is derived from a workflow
// tag (Re-open/Fixing/Pending/Deployed/Done); "open" means no workflow tag. Keeping the
// two in sync means dragging a card also updates its tag (and pushes to Discord).
//
// GƯƠNG bot/skills/bug_sync.py (_STATUS_PRECEDENCE): tên tag chấp nhận NHIỀU biến thể
// (Discord đặt "Re-open" có gạch nối) — đổi bộ tên ở đây thì đổi cả bên bot.

import type { BugLabel, BugStatus } from '../types';

/** Accent color per status (matches the Kanban column dots). */
export const BUG_STATUS_COLOR: Record<BugStatus, string> = {
  open: '#94a3b8',
  reopen: '#f472b6',
  fixing: '#fb923c',
  pending: '#f59e0b',
  deployed: '#6366f1',
  done: '#22c55e',
};

/** Label name that represents each status (null = no label → "open"). Tên CHUẨN khi tạo mới. */
export const STATUS_TAG_NAME: Record<BugStatus, string | null> = {
  open: null,
  reopen: 'Re-open',
  fixing: 'Fixing',
  pending: 'Pending',
  deployed: 'Deployed',
  done: 'Done',
};

/** Mọi biến thể tên (viết thường) được coi là MỖI trạng thái — nhận cả "Re-open" lẫn "Reopen". */
const STATUS_ALIASES: Partial<Record<BugStatus, string[]>> = {
  reopen: ['re-open', 'reopen'],
  fixing: ['fixing'],
  pending: ['pending'],
  deployed: ['deployed'],
  done: ['done'],
};

const ALL_STATUS_NAMES = new Set(Object.values(STATUS_ALIASES).flat());

/** Nhãn này (theo tên) có phải nhãn workflow của `status` không? */
export function isStatusLabelName(name: string, status: BugStatus): boolean {
  return (STATUS_ALIASES[status] ?? []).includes(name.trim().toLowerCase());
}

/** Nhãn này có phải nhãn workflow (của BẤT KỲ trạng thái nào) không? */
export function isAnyStatusLabelName(name: string): boolean {
  return ALL_STATUS_NAMES.has(name.trim().toLowerCase());
}

/**
 * The label set a bug should have for `status`: drop any existing workflow labels,
 * then add the one matching `status` (if that label exists in the palette).
 */
export function labelsForStatus(currentIds: string[], status: BugStatus, labels: BugLabel[]): string[] {
  const byId = new Map(labels.map((l) => [l.id, l]));
  const kept = currentIds.filter((id) => {
    const l = byId.get(id);
    return !(l && isAnyStatusLabelName(l.name));
  });
  const label = labels.find((l) => isStatusLabelName(l.name, status));
  if (label && !kept.includes(label.id)) kept.push(label.id);
  return kept;
}
