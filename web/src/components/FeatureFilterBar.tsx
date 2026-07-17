import { useCallback } from 'react';
import { FEATURE_KIND_LABEL, type FeatureLabel, type TeamMember } from '../types';
import { labelGroup } from '../lib/bugLabelGroups';
import { DONE, OPEN, type FeatureFacet, type FeatureFilterToken } from '../lib/featureFilter';
import TokenFilterBar, { type FacetDef, type FilterOpt } from './TokenFilterBar';

// matchFeature + kiểu facet nằm ở lib/featureFilter.ts (thuần, test được). Re-export để
// chỗ gọi chỉ cần import từ một nơi — cùng cách TaskFilterBar làm.
export { matchFeature, isFeatureDone } from '../lib/featureFilter';
export type { FeatureFacet, FeatureFilterToken } from '../lib/featureFilter';

const FACETS: FacetDef<FeatureFacet>[] = [
  { key: 'kind', label: 'Loại', icon: '🎯' },
  { key: 'progress', label: 'Tiến độ', icon: '📊' },
  { key: 'label', label: 'Nhãn', icon: '🔖' },
  { key: 'version', label: 'Version', icon: '🏷️' },
  { key: 'member', label: 'Người làm', icon: '🙋' },
];

const KIND_OPTS: FilterOpt[] = [
  { value: 'delivery', label: FEATURE_KIND_LABEL.delivery, icon: '🎯' },
  { value: 'ongoing', label: FEATURE_KIND_LABEL.ongoing, icon: '🔁' },
];

// Cùng màu với STATUS_COLOR done/todo của task để quét mắt ra nghĩa ngay.
const PROGRESS_OPTS: FilterOpt[] = [
  { value: DONE, label: 'Hoàn thành', color: '#22c55e' },
  { value: OPEN, label: 'Chưa hoàn thành', color: '#94a3b8' },
];

function labelOpts(labels: FeatureLabel[]): FilterOpt[] {
  return labels.map((l) => ({ value: l.id, label: l.name, color: l.color, icon: l.icon }));
}

function facetOpts(facet: FeatureFacet, labels: FeatureLabel[], members: TeamMember[]): FilterOpt[] {
  if (facet === 'kind') return KIND_OPTS;
  if (facet === 'progress') return PROGRESS_OPTS;
  // Version LÀ nhãn — tách facet riêng chỉ để khỏi phải dò '1.2.x' giữa cả rổ nhãn.
  // `labels` vào đây đã qua sortFeatureLabels: version mới nhất đứng đầu cụm.
  if (facet === 'version') return labelOpts(labels.filter((l) => labelGroup(l.name) === 'version'));
  if (facet === 'label') return labelOpts(labels.filter((l) => labelGroup(l.name) !== 'version'));
  return [
    { value: 'none', label: 'Chưa ai làm' },
    { value: 'any', label: 'Bất kỳ' },
    { value: 'me', label: 'Tôi' },
    ...members.map((m) => ({ value: m.uid, label: m.displayName })),
  ];
}

interface Props {
  /** Palette nhãn của project, ĐÃ sort (sortFeatureLabels). */
  labels: FeatureLabel[];
  members: TeamMember[];
  tokens: FeatureFilterToken[];
  onTokens: (t: FeatureFilterToken[]) => void;
  query: string;
  onQuery: (q: string) => void;
}

/** Bộ lọc token của tab Features — cùng khung với Bugs/task, chỉ khác facet. */
export default function FeatureFilterBar({ labels, members, tokens, onTokens, query, onQuery }: Props) {
  const optsOf = useCallback((f: FeatureFacet) => facetOpts(f, labels, members), [labels, members]);
  return (
    <TokenFilterBar
      facets={FACETS}
      optsOf={optsOf}
      tokens={tokens}
      onTokens={onTokens}
      query={query}
      onQuery={onQuery}
      placeholder="Lọc theo tên feature…"
    />
  );
}
