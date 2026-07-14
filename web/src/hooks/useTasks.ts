// useTasks — LIVE tasks for one sprint (or backlog when sprintId is null). Listener only.
// Write operations live in lib/taskWrites.ts so the modal and board share them without
// spinning up extra listeners. Resets to [] on sprintId change (rule in CLAUDE.md).

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { Task } from '../types';

export function useTasks(sprintId: string | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTasks([]); // reset before attaching new listener to avoid stale flashes
    setLoading(true);
    const q = query(collection(db, 'tasks'), where('sprintId', '==', sprintId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ ...(d.data() as Task), id: d.id }));
        rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setTasks(rows);
        setLoading(false);
      },
      (err) => {
        console.error('useTasks listener error', err);
        setLoading(false);
      },
    );
    return unsub; // cleanup: avoid Firestore cost leak
  }, [sprintId]);

  return { tasks, loading };
}
