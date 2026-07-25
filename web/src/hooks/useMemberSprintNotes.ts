// useSprintNotes — ghi chú đánh giá của MỌI người trong MỘT sprint (bảng member_sprint_notes),
// LIVE. Admin-only ở RLS (0059): member gọi vào nhận rỗng — dùng `enabled` để chỉ chạy khi
// người xem là admin, khỏi mở socket thừa (giống useMemberComp). Từ 0062 mỗi (người, sprint)
// có NHIỀU dòng nhật ký — byMember trả entry MỚI NHẤT của từng người (cho preview danh sách).

import { useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { rowToMemberSprintNote } from '../lib/mappers';
import type { MemberSprintNote } from '../types';
import { useLiveQuery } from './useLiveQuery';

export function useSprintNotes(sprintId: string | null, enabled = true) {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('member_sprint_notes')
      .select('*')
      .eq('sprint_id', sprintId as string);
    if (error) throw error;
    return (data ?? []).map(rowToMemberSprintNote);
  }, [sprintId]);

  const { data, loading, refetch } = useLiveQuery<MemberSprintNote>({
    table: 'member_sprint_notes',
    fetcher,
    filter: sprintId ? `sprint_id=eq.${sprintId}` : undefined,
    deps: [sprintId, enabled],
    enabled: enabled && Boolean(sprintId),
  });

  // Entry MỚI NHẤT của mỗi người (so createdAt tường minh — thứ tự fetch không đảm bảo).
  const byMember = useMemo(() => {
    const map = new Map<string, MemberSprintNote>();
    for (const n of data) {
      const cur = map.get(n.memberId);
      if (!cur || (n.createdAt?.toMillis() ?? 0) > (cur.createdAt?.toMillis() ?? 0)) {
        map.set(n.memberId, n);
      }
    }
    return map;
  }, [data]);

  return { notes: data, byMember, loading, refetch };
}
