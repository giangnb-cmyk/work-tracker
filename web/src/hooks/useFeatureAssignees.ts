// useFeatureAssignees — uid các assignee ĐANG có task trong một feature (distinct).
// Dùng khi TẠO task gắn feature: hợp với người tham gia thêm tay (feature.memberIds) ra
// "tất cả người tham gia" để auto-gắn vào watcher của task mới (0046).
//
// Tra một lần (không realtime): đây là seed lúc mở modal tạo, không cần bám thay đổi live.

import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

export function useFeatureAssignees(featureId: string | null, enabled: boolean): string[] {
  const [uids, setUids] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled || !featureId) {
      setUids([]);
      return;
    }
    let alive = true;
    void supabase
      .from('tasks')
      .select('assignee_id')
      .eq('feature_id', featureId)
      .not('assignee_id', 'is', null)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          console.error('Tải người tham gia feature thất bại', error);
          return;
        }
        setUids([...new Set((data ?? []).map((r) => r.assignee_id as string))]);
      });
    return () => {
      alive = false;
    };
  }, [featureId, enabled]);

  return uids;
}
