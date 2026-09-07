// useHolidays — ngày lễ toàn công ty (bảng `holidays`, 0085). Dùng để tính ngày công.

import { useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { rowToHoliday } from '../lib/mappers';
import { useLiveQuery } from './useLiveQuery';
import type { Holiday } from '../types';

export function useHolidays() {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase.from('holidays').select('*').order('day', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToHoliday);
  }, []);

  const { data: holidays, loading } = useLiveQuery<Holiday>({ table: 'holidays', fetcher, deps: [] });

  /** Set ngày để tra O(1) trong lib/workdays. */
  const holidaySet = useMemo(() => new Set(holidays.map((h) => h.day)), [holidays]);

  return { holidays, holidaySet, loading };
}
