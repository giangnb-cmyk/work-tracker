import { useCallback } from 'react';
import { BUG_STATUSES, BUG_STATUS_LABEL, type Bug, type BugLabel, type TeamMember } from '../../types';
import { BUG_STATUS_COLOR } from '../../lib/bugStatus';
import { labelsInGroup } from '../../lib/bugLabelGroups';
import TokenFilterBar, { type FacetDef, type FilterOpt, type FilterToken } from '../TokenFilterBar';

export type Facet = 'status' | 'version' | 'label' | 'assignee' | 'reporter';
/** Token của riêng miền bug — khung lọc dùng chung ở ../TokenFilterBar. */
export type BugFilterToken = FilterToken<Facet>;

const FACETS: FacetDef<Facet>[] = [
  { key: 'status', label: 'Trạng thái', icon: '🚦' },
  { key: 'version', label: 'Version', icon: '🏷️' },
  { key: 'label', label: 'Nhãn', icon: '🔖' },
  { key: 'assignee', label: 'Người nhận', icon: '🙋' },
  { key: 'reporter', label: 'Người báo', icon: '✍️' },
];

function peopleOpts(members: TeamMember[]): FilterOpt[] {
  return [
    { value: 'none', label: 'Chưa giao' },
    { value: 'any', label: 'Bất kỳ' },
    { value: 'me', label: 'Tôi' },
    ...members.map((m) => ({ value: m.uid, label: m.displayName })),
  ];
}

function labelOpts(labels: BugLabel[]): FilterOpt[] {
  return labels.map((l) => ({ value: l.id, label: l.name, color: l.color, icon: l.icon }));
}

function facetOpts(facet: Facet, labels: BugLabel[], members: TeamMember[]): FilterOpt[] {
  if (facet === 'status') {
    return BUG_STATUSES.map((s) => ({ value: s, label: BUG_STATUS_LABEL[s], color: BUG_STATUS_COLOR[s] }));
  }
  // Version LÀ nhãn — tách facet riêng chỉ để khỏi phải dò tìm '1.0.x' giữa cả rổ nhãn.
  // Mới nhất lên đầu: lọc version gần như luôn là tìm bản vừa build.
  if (facet === 'version') {
    return labelOpts(labelsInGroup(labels, 'version'))
      .sort((a, b) => b.label.localeCompare(a.label, undefined, { numeric: true }));
  }
  if (facet === 'label') return labelOpts(labels);
  return peopleOpts(members);
}

/** Does a bug pass every active filter token? Exported for the list/board. */
export function matchBug(b: Bug, tokens: BugFilterToken[], meId: string): boolean {
  return tokens.every((t) => {
    if (t.facet === 'status') {
      const has = t.values.includes(b.status);
      return t.op === 'is' ? has : !has;
    }
    if (t.facet === 'label') {
      return t.op === 'is'
        ? t.values.every((v) => b.labelIds.includes(v))
        : t.values.every((v) => !b.labelIds.includes(v));
    }
    // Version cũng là nhãn, nhưng dùng OR chứ không AND: một bug chỉ mang ĐÚNG MỘT version,
    // nên "là 1.0.x, 1.0.y" mà hiểu theo AND thì luôn ra rỗng — vô nghĩa với người dùng.
    if (t.facet === 'version') {
      const any = t.values.some((v) => b.labelIds.includes(v));
      return t.op === 'is' ? any : !any;
    }
    const uid = t.facet === 'assignee' ? b.assigneeId : b.reporterId;
    const one = (v: string) => (v === 'none' ? !uid : v === 'any' ? !!uid : v === 'me' ? uid === meId : uid === v);
    const any = t.values.some(one);
    return t.op === 'is' ? any : !any;
  });
}

interface Props {
  labels: BugLabel[];
  members: TeamMember[];
  tokens: BugFilterToken[];
  onTokens: (t: BugFilterToken[]) => void;
  query: string;
  onQuery: (q: string) => void;
}

/** Bộ lọc token của tab Bugs — chỉ cấp facet + option cho khung lọc dùng chung. */
export default function BugFilterBar({ labels, members, tokens, onTokens, query, onQuery }: Props) {
  const optsOf = useCallback((f: Facet) => facetOpts(f, labels, members), [labels, members]);
  return (
    <TokenFilterBar
      facets={FACETS}
      optsOf={optsOf}
      tokens={tokens}
      onTokens={onTokens}
      query={query}
      onQuery={onQuery}
      placeholder="Lọc theo tên bug hoặc #số…"
    />
  );
}
