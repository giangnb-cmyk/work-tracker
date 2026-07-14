// useSprints — live list of sprints + admin mutations. See DATA_MODEL.md.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Sprint, SprintStatus } from '../types';

interface NewSprintInput {
  name: string;
  goal: string;
  startDate: Date | null;
  endDate: Date | null;
}

export function useSprints(currentUid: string) {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'sprints'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSprints(snap.docs.map((d) => ({ ...(d.data() as Sprint), id: d.id })));
        setLoading(false);
      },
      (err) => {
        console.error('useSprints listener error', err);
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  const activeSprint = useMemo(
    () => sprints.find((s) => s.status === 'active') ?? null,
    [sprints],
  );

  const createSprint = useCallback(
    async (input: NewSprintInput) => {
      const ref = await addDoc(collection(db, 'sprints'), {
        name: input.name.trim(),
        goal: input.goal.trim(),
        status: 'planning' as SprintStatus,
        startDate: input.startDate ? Timestamp.fromDate(input.startDate) : null,
        endDate: input.endDate ? Timestamp.fromDate(input.endDate) : null,
        createdAt: serverTimestamp(),
        createdBy: currentUid,
      });
      await updateDoc(ref, { id: ref.id });
      return ref.id;
    },
    [currentUid],
  );

  const updateSprint = useCallback(async (id: string, patch: Partial<Sprint>) => {
    await updateDoc(doc(db, 'sprints', id), patch);
  }, []);

  const setSprintStatus = useCallback(
    (id: string, status: SprintStatus) => updateDoc(doc(db, 'sprints', id), { status }),
    [],
  );

  const deleteSprint = useCallback((id: string) => deleteDoc(doc(db, 'sprints', id)), []);

  return { sprints, activeSprint, loading, createSprint, updateSprint, setSprintStatus, deleteSprint };
}
