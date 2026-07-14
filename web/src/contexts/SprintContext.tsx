// SprintContext — app-wide sprint list, the currently selected sprint, and team roster.
// Views read from here so they share one set of listeners.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { useSprints } from '../hooks/useSprints';
import { useMembers } from '../hooks/useMembers';
import type { Sprint, TeamMember } from '../types';

interface SprintContextState extends ReturnType<typeof useSprints> {
  members: TeamMember[];
  membersLoading: boolean;
  selectedSprintId: string | null;
  selectedSprint: Sprint | null;
  selectSprint: (id: string | null) => void;
}

const SprintContext = createContext<SprintContextState | null>(null);

export function SprintProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const sprintApi = useSprints(user?.uid ?? '');
  const { members, loading: membersLoading } = useMembers();
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // Default the selection to the active sprint once sprints load (until the user picks one).
  useEffect(() => {
    if (touched) return;
    if (sprintApi.activeSprint) setSelectedSprintId(sprintApi.activeSprint.id);
    else if (sprintApi.sprints.length > 0) setSelectedSprintId(sprintApi.sprints[0].id);
  }, [touched, sprintApi.activeSprint, sprintApi.sprints]);

  const selectedSprint = useMemo(
    () => sprintApi.sprints.find((s) => s.id === selectedSprintId) ?? null,
    [sprintApi.sprints, selectedSprintId],
  );

  const value = useMemo<SprintContextState>(
    () => ({
      ...sprintApi,
      members,
      membersLoading,
      selectedSprintId,
      selectedSprint,
      selectSprint: (id) => {
        setTouched(true);
        setSelectedSprintId(id);
      },
    }),
    [sprintApi, members, membersLoading, selectedSprintId, selectedSprint],
  );

  return <SprintContext.Provider value={value}>{children}</SprintContext.Provider>;
}

export function useSprintContext(): SprintContextState {
  const ctx = useContext(SprintContext);
  if (!ctx) throw new Error('useSprintContext must be used within SprintProvider');
  return ctx;
}
