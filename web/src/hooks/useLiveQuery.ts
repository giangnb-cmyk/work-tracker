// Generic "fetch + subscribe" hook: runs a Supabase query, then re-runs it whenever
// the table emits a realtime change (RLS-filtered). Simple and correct for the modest
// row counts here — no manual cache patching to get subtly wrong.

import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

interface Options<T> {
  /** Table to watch for realtime changes. */
  table: string;
  /** Runs the select + maps rows to T[]. Must be stable per `deps`. */
  fetcher: () => Promise<T[]>;
  /** Postgres realtime filter, e.g. `sprint_id=eq.<id>`. Omit to watch the whole table. */
  filter?: string;
  /** Re-subscribe/re-fetch when these change. */
  deps: unknown[];
  /** When false, skip (returns [] , not loading). */
  enabled?: boolean;
}

export function useLiveQuery<T>({ table, fetcher, filter, deps, enabled = true }: Options<T>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setData([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);

    const run = () =>
      fetcher()
        .then((rows) => {
          if (alive) {
            setData(rows);
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error(`useLiveQuery(${table}) fetch failed`, err);
          if (alive) setLoading(false);
        });

    void run();

    const channel = supabase
      .channel(`live:${table}:${filter ?? 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        () => void run(),
      )
      .subscribe();

    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading };
}
