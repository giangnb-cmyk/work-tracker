// useMyTasks — all tasks assigned to a user across every sprint. See DATA_MODEL.md.

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { Task } from '../types';

export function useMyTasks(uid: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    const q = query(collection(db, 'tasks'), where('assigneeId', '==', uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ ...(d.data() as Task), id: d.id }));
        rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setTasks(rows);
        setLoading(false);
      },
      (err) => {
        console.error('useMyTasks listener error', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [uid]);

  return { tasks, loading };
}
