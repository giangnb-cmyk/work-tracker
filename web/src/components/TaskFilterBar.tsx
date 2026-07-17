import { useCallback } from 'react';
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Feature,
  type TeamMember,
} from '../types';
import { PRIO_COLOR, STATUS_COLOR } from '../lib/taskColors';
import type { TaskFacet, TaskFilterToken } from '../lib/taskFilter';
import TokenFilterBar, { type FacetDef, type FilterOpt } from './TokenFilterBar';

// matchTask + kiểu facet nằm ở lib/taskFilter.ts (thuần, test được). Re-export để chỗ gọi
// chỉ cần import từ một nơi.
export { matchTask } from '../lib/taskFilter';
export type { TaskFacet, TaskFilterToken } from '../lib/taskFilter';

const FACETS: FacetDef<TaskFacet>[] = [
  { key: 'status', label: 'Trạng thái', icon: '🚦' },
  { key: 'priority', label: 'Ưu tiên', icon: '🔥' },
  { key: 'assignee', label: 'Người nhận', icon: '🙋' },
  { key: 'reporter', label: 'Người tạo', icon: '✍️' },
  { key: 'feature', label: 'Feature', icon: '🧩' },
];

function peopleOpts(members: TeamMember[]): FilterOpt[] {
  return [
    { value: 'none', label: 'Chưa giao' },
    { value: 'any', label: 'Bất kỳ' },
    { value: 'me', label: 'Tôi' },
    ...members.map((m) => ({ value: m.uid, label: m.displayName })),
  ];
}

function facetOpts(facet: TaskFacet, features: Feature[], members: TeamMember[]): FilterOpt[] {
  if (facet === 'status') {
    return TASK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], color: STATUS_COLOR[s] }));
  }
  if (facet === 'priority') {
    // Gấp trước, Thấp sau: lọc ưu tiên gần như luôn là đi tìm việc gấp.
    return [...TASK_PRIORITIES].reverse().map((p) => ({
      value: p,
      label: PRIORITY_LABEL[p],
      color: PRIO_COLOR[p],
    }));
  }
  if (facet === 'feature') {
    return [
      { value: 'none', label: 'Chưa gắn feature' },
      ...features.map((f) => ({ value: f.id, label: f.name, icon: f.icon, color: f.color })),
    ];
  }
  return peopleOpts(members);
}

interface Props {
  features: Feature[];
  members: TeamMember[];
  tokens: TaskFilterToken[];
  onTokens: (t: TaskFilterToken[]) => void;
  query: string;
  onQuery: (q: string) => void;
}

/** Bộ lọc token cho task — cùng khung với tab Bugs, chỉ khác facet. */
export default function TaskFilterBar({ features, members, tokens, onTokens, query, onQuery }: Props) {
  const optsOf = useCallback((f: TaskFacet) => facetOpts(f, features, members), [features, members]);
  return (
    <TokenFilterBar
      facets={FACETS}
      optsOf={optsOf}
      tokens={tokens}
      onTokens={onTokens}
      query={query}
      onQuery={onQuery}
      placeholder="Lọc theo tên task…"
    />
  );
}
