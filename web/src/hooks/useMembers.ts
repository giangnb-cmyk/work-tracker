// useMembers — live team roster from `users`. Read-only for the UI.

import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import type { TeamMember } from '../types';

export function useMembers() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('displayName'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMembers(snap.docs.map((d) => d.data() as TeamMember));
        setLoading(false);
      },
      (err) => {
        console.error('useMembers listener error', err);
        setLoading(false);
      },
    );
    return unsub; // cleanup: avoid Firestore cost leak
  }, []);

  return { members, loading };
}
