// useAuditLog — nhật ký hệ thống (bảng `audit_log`, migration 0035).
//
// RLS `audit_log_select` chỉ cho admin đọc; member gọi sẽ nhận mảng rỗng chứ không lỗi.
// Bảng chỉ thêm chứ không bớt nên kéo N dòng mới nhất (không phải cả bảng) — tránh chạm
// trần 1000 dòng của PostgREST khi log dài ra.

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { rowToAudit } from '../lib/mappers';
import { useLiveQuery } from './useLiveQuery';
import type { AuditEntry } from '../types';

const DEFAULT_LIMIT = 300;

export function useAuditLog(limit = DEFAULT_LIMIT, enabled = true) {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(rowToAudit);
  }, [limit]);

  const { data: entries, loading } = useLiveQuery<AuditEntry>({
    table: 'audit_log',
    fetcher,
    deps: [limit, enabled],
    enabled,
  });

  return { entries, loading };
}
