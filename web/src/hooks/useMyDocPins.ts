// useMyDocPins — tài liệu CHÍNH TÔI đã ghim (bảng `project_doc_pins`, migration 0067).
//
// Không lọc theo dự án: RLS đã bó về đúng ghim của người đang đăng nhập, và một người chỉ
// ghim vài mục nên kéo hết rồi giao với tài liệu của dự án đang mở là xong — nhẹ hơn việc
// join sang project_docs chỉ để lọc.

import { useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { useLiveQuery } from './useLiveQuery';

interface PinRow {
  doc_id: string;
}

export function useMyDocPins(uid: string) {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase.from('project_doc_pins').select('doc_id');
    if (error) throw error;
    return (data ?? []) as PinRow[];
  }, []);

  const { data, loading } = useLiveQuery<PinRow>({
    table: 'project_doc_pins',
    fetcher,
    // Kênh lọc theo user_id: bảng này của cả web nên không lọc là nghe cả ghim người khác
    // (RLS chặn đọc nội dung, nhưng vẫn tốn một lượt refetch vô ích mỗi lần ai đó ghim).
    filter: `user_id=eq.${uid}`,
    deps: [uid],
    enabled: Boolean(uid),
  });

  const pinnedIds = useMemo(() => new Set(data.map((r) => r.doc_id)), [data]);
  return { pinnedIds, loading };
}
