// useSprints — live list of sprints + admin mutations. See DATA_MODEL.md.

import { useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { rowToSprint } from '../lib/mappers';
import { toISO } from '../lib/time';
import { useLiveQuery } from './useLiveQuery';
import type { Sprint, SprintStatus } from '../types';

interface NewSprintInput {
  name: string;
  goal: string;
  startDate: Date | null;
  endDate: Date | null;
}

/** Map a camelCase sprint patch to a snake_case DB row patch. */
function sprintPatchToRow(patch: Partial<Sprint>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.goal !== undefined) row.goal = patch.goal;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.startDate !== undefined) row.start_date = toISO(patch.startDate);
  if (patch.endDate !== undefined) row.end_date = toISO(patch.endDate);
  return row;
}

export function useSprints(currentUid: string) {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('sprints')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToSprint);
  }, []);

  const { data: sprints, loading, refetch } = useLiveQuery<Sprint>({ table: 'sprints', fetcher, deps: [] });

  const activeSprint = useMemo(
    () => sprints.find((s) => s.status === 'active') ?? null,
    [sprints],
  );

  const createSprint = useCallback(
    async (input: NewSprintInput) => {
      const { data, error } = await supabase
        .from('sprints')
        .insert({
          name: input.name.trim(),
          goal: input.goal.trim(),
          status: 'planning' as SprintStatus,
          start_date: toISO(input.startDate),
          end_date: toISO(input.endDate),
          created_by: currentUid || null,
        })
        .select('id')
        .single();
      if (error) throw error;
      await refetch(); // hiện sprint mới NGAY, không đợi realtime dội về
      return data.id as string;
    },
    [currentUid, refetch],
  );

  const updateSprint = useCallback(async (id: string, patch: Partial<Sprint>) => {
    const { error } = await supabase.from('sprints').update(sprintPatchToRow(patch)).eq('id', id);
    if (error) throw error;
    await refetch();
  }, [refetch]);

  const setSprintStatus = useCallback(async (id: string, status: SprintStatus) => {
    const { error } = await supabase.from('sprints').update({ status }).eq('id', id);
    if (error) throw error;
    await refetch();
  }, [refetch]);

  const deleteSprint = useCallback(async (id: string) => {
    const { error } = await supabase.from('sprints').delete().eq('id', id);
    if (error) throw error;
    await refetch();
  }, [refetch]);

  return { sprints, activeSprint, loading, createSprint, updateSprint, setSprintStatus, deleteSprint };
}
