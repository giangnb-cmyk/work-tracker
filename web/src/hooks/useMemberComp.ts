// useMemberComp — LƯƠNG toàn cục của mọi người (bảng member_compensation), LIVE. Bảng nhỏ
// (một dòng/người) nên nạp hết rồi tra theo member_id. Admin-only ở RLS: member gọi vào
// nhận rỗng — dùng `enabled` để chỉ chạy khi người xem là admin, khỏi mở socket thừa.

import { useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { rowToMemberComp } from '../lib/mappers';
import type { MemberComp } from '../types';
import { useLiveQuery } from './useLiveQuery';

export function useMemberComp(enabled = true) {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase.from('member_compensation').select('*');
    if (error) throw error;
    return (data ?? []).map(rowToMemberComp);
  }, []);

  const { data, loading } = useLiveQuery<MemberComp>({
    table: 'member_compensation',
    fetcher,
    deps: [enabled],
    enabled,
  });

  const byMember = useMemo(() => new Map(data.map((c) => [c.memberId, c])), [data]);

  return { comp: data, byMember, loading };
}
