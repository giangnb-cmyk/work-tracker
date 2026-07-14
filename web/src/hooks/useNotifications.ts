// useNotifications — live in-app notifications for the current user (newest 30).

import { useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { rowToNotification } from '../lib/mappers';
import { useLiveQuery } from './useLiveQuery';
import type { AppNotification } from '../types';

const MAX_ITEMS = 30;

export function useNotifications(uid: string) {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', uid)
      .order('created_at', { ascending: false })
      .limit(MAX_ITEMS);
    if (error) throw error;
    return (data ?? []).map(rowToNotification);
  }, [uid]);

  const { data: items, loading } = useLiveQuery<AppNotification>({
    table: 'notifications',
    fetcher,
    filter: `recipient_id=eq.${uid}`,
    deps: [uid],
    enabled: Boolean(uid),
  });

  const unread = useMemo(() => items.filter((n) => !n.read).length, [items]);
  return { items, unread, loading };
}
