// Bug status <-> workflow label. The Kanban column (status) mirrors a workflow
// tag (Fixing/Pending/Deployed/Done); "open" means no workflow tag. Keeping the
// two in sync means dragging a card also updates its tag (and pushes to Discord).

import type { BugLabel, BugStatus } from '../types';

/** Accent color per status (matches the Kanban column dots). */
export const BUG_STATUS_COLOR: Record<BugStatus, string> = {
  open: '#94a3b8',
  fixing: '#fb923c',
  pending: '#f59e0b',
  deployed: '#6366f1',
  done: '#22c55e',
};

/** Label name that represents each status (null = no label → "open"). */
export const STATUS_TAG_NAME: Record<BugStatus, string | null> = {
  open: null,
  fixing: 'Fixing',
  pending: 'Pending',
  deployed: 'Deployed',
  done: 'Done',
};

const STATUS_NAMES = new Set(['fixing', 'pending', 'deployed', 'done']);

/**
 * Nhãn này có đang bị badge trạng thái nói hộ không? -> chỗ nào đã hiện badge thì khỏi
 * hiện thêm chip trùng (bug xong hiện cả "DONE" lẫn chip "✅ Done" là thừa).
 *
 * So với ĐÚNG nhãn của `status` hiện tại, KHÔNG phải cả bộ workflow. Nếu dữ liệu lệch
 * (status=done mà vẫn còn nhãn Fixing) thì chip Fixing phải hiện ra cho thấy mà sửa —
 * giấu cả bộ là giấu luôn cái sai. 'Re-open' cũng vì thế mà vẫn hiện: không status nào
 * nói hộ nó.
 */
export function isRedundantStatusLabel(name: string, status: BugStatus): boolean {
  const tag = STATUS_TAG_NAME[status];
  return tag !== null && name.trim().toLowerCase() === tag.toLowerCase();
}

/**
 * The label set a bug should have for `status`: drop any existing workflow labels,
 * then add the one matching `status` (if that label exists in the palette).
 */
export function labelsForStatus(currentIds: string[], status: BugStatus, labels: BugLabel[]): string[] {
  const byId = new Map(labels.map((l) => [l.id, l]));
  const kept = currentIds.filter((id) => {
    const l = byId.get(id);
    return !(l && STATUS_NAMES.has(l.name.toLowerCase()));
  });
  const target = STATUS_TAG_NAME[status];
  if (target) {
    const label = labels.find((l) => l.name.toLowerCase() === target.toLowerCase());
    if (label && !kept.includes(label.id)) kept.push(label.id);
  }
  return kept;
}
