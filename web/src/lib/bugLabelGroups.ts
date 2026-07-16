// Group the flat bug-label palette into semantic pickers (Severity / Category /
// Platform / Version) for the bug detail form. Grouping is by label name so no
// schema change is needed; workflow labels (Fixing/Done/…) belong to the status
// field and are handled separately.

import type { BugLabel } from '../types';

export type LabelGroup = 'severity' | 'category' | 'platform' | 'version' | 'workflow' | 'other';

const SEVERITY = new Set(['low', 'medium', 'high', 'critical', 'urgent']);
const CATEGORY = new Set(['bug', 'performance', 'visual', 'logic', 'improve']);
const PLATFORM = new Set(['android', 'ios', 'web', 'pc', 'mac', 'windows', 'unity', 'html5', 'server']);
const WORKFLOW = new Set(['fixing', 'pending', 'deployed', 'done', 're-open', 'reopen']);

export function labelGroup(name: string): LabelGroup {
  const n = name.trim().toLowerCase();
  if (SEVERITY.has(n)) return 'severity';
  if (CATEGORY.has(n)) return 'category';
  if (PLATFORM.has(n)) return 'platform';
  if (WORKFLOW.has(n)) return 'workflow';
  if (/^v?\d+(\.\d+)*(\.x)?$/i.test(n) || n.endsWith('.x')) return 'version';
  return 'other';
}

export function labelsInGroup(labels: BugLabel[], group: LabelGroup): BugLabel[] {
  return labels.filter((l) => labelGroup(l.name) === group);
}

/** The id of the label currently selected from `group` (or '' if none). */
export function selectedInGroup(labelIds: string[], labels: BugLabel[], group: LabelGroup): string {
  const byId = new Map(labels.map((l) => [l.id, l]));
  return labelIds.find((id) => {
    const l = byId.get(id);
    return l && labelGroup(l.name) === group;
  }) ?? '';
}

/** Replace the label chosen from `group`: drop others in that group, add `labelId`. */
export function setGroupLabel(labelIds: string[], labels: BugLabel[], group: LabelGroup, labelId: string): string[] {
  const inGroup = new Set(labelsInGroup(labels, group).map((l) => l.id));
  const kept = labelIds.filter((id) => !inGroup.has(id));
  return labelId ? [...kept, labelId] : kept;
}
