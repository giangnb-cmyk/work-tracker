// useMembers — live team roster from `profiles`. Read-only for the UI.

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { rowToMember } from '../lib/mappers';
import { useLiveQuery } from './useLiveQuery';
import type { TeamMember } from '../types';

export function useMembers() {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('display_name', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToMember);
  }, []);

  const { data: members, loading } = useLiveQuery<TeamMember>({
    table: 'profiles',
    fetcher,
    deps: [],
  });

  return { members, loading };
}
