// usePeriodReviews — bản đánh giá AI đã sinh cho MỘT kỳ (bảng member_period_reviews), LIVE theo
// (period_kind, period_start). Subscribe cả bảng để summary hiện NGAY khi bot ghi xong. Admin-only
// ở RLS (0060) — enabled=isAdmin để member không mở socket thừa. Trả byMember (Map memberId→review).

import { useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { rowToMemberPeriodReview } from '../lib/mappers';
import type { MemberPeriodReview, PeriodKind } from '../types';
import { useLiveQuery } from './useLiveQuery';

export function usePeriodReviews(kind: PeriodKind, periodStart: string | null, enabled = true) {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('member_period_reviews')
      .select('*')
      .eq('period_kind', kind)
      .eq('period_start', periodStart as string);
    if (error) throw error;
    return (data ?? []).map(rowToMemberPeriodReview);
  }, [kind, periodStart]);

  const { data, loading, refetch } = useLiveQuery<MemberPeriodReview>({
    table: 'member_period_reviews',
    fetcher,
    deps: [kind, periodStart, enabled],
    enabled: enabled && Boolean(periodStart),
  });

  const byMember = useMemo(() => new Map(data.map((r) => [r.memberId, r])), [data]);
  return { reviews: data, byMember, loading, refetch };
}
