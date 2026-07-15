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
