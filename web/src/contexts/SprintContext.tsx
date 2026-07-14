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
import { useProjects } from '../hooks/useProjects';
import { useFeatures } from '../hooks/useFeatures';
import type { Feature, Project, Sprint, TeamMember } from '../types';

const PROJECT_KEY = 'selectedProjectId';

interface SprintContextState extends ReturnType<typeof useSprints> {
  members: TeamMember[];
  membersLoading: boolean;
  projects: Project[];
  projectsLoading: boolean;
  features: Feature[];
  featuresLoading: boolean;
  selectedProjectId: string | null;
  selectedProject: Project | null;
  selectProject: (id: string | null) => void;
  selectedSprintId: string | null;
  selectedSprint: Sprint | null;
  selectSprint: (id: string | null) => void;
}

const SprintContext = createContext<SprintContextState | null>(null);

export function SprintProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const sprintApi = useSprints(user?.uid ?? '');
  const { members, loading: membersLoading } = useMembers();
  const { projects, loading: projectsLoading } = useProjects();
  const { features, loading: featuresLoading } = useFeatures();
  // Selected project is the app-entry gate; persist it so a refresh stays in the project.
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    () => localStorage.getItem(PROJECT_KEY),
  );
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  function selectProject(id: string | null) {
    if (id) localStorage.setItem(PROJECT_KEY, id);
    else localStorage.removeItem(PROJECT_KEY);
    setSelectedProjectId(id);
  }

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
      projects,
      projectsLoading,
      features,
      featuresLoading,
      selectedProjectId,
      selectedProject,
      selectProject,
      selectedSprintId,
      selectedSprint,
      selectSprint: (id) => {
        setTouched(true);
        setSelectedSprintId(id);
      },
    }),
    [sprintApi, members, membersLoading, projects, projectsLoading, features, featuresLoading, selectedProjectId, selectedProject, selectedSprintId, selectedSprint],
  );

  return <SprintContext.Provider value={value}>{children}</SprintContext.Provider>;
}

export function useSprintContext(): SprintContextState {
  const ctx = useContext(SprintContext);
  if (!ctx) throw new Error('useSprintContext must be used within SprintProvider');
  return ctx;
}
