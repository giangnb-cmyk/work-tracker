// Admin-only member (users doc) writes. Firestore rules require admin for these.
// Members created here (for Discord-only teammates who never sign in) use an
// auto-generated doc id as their uid; real sign-ins are keyed by Firebase Auth uid.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { JobRole, TeamMember, UserRole } from '../types';

export interface MemberInput {
  displayName: string;
  email: string;
  role: UserRole;
  jobRole: JobRole;
  discordId: string;
  notionUserId: string;
}

export async function createMember(input: MemberInput): Promise<string> {
  const ref = await addDoc(collection(db, 'users'), {
    displayName: input.displayName.trim(),
    email: input.email.trim(),
    role: input.role,
    jobRole: input.jobRole,
    discordId: input.discordId.trim(),
    notionUserId: input.notionUserId.trim(),
    photoURL: '',
    createdAt: serverTimestamp(),
  });
  // Mirror the generated id into `uid` so it matches the sign-in-created shape.
  await setDoc(ref, { uid: ref.id }, { merge: true });
  return ref.id;
}

export function updateMember(uid: string, patch: Partial<TeamMember>): Promise<void> {
  return updateDoc(doc(db, 'users', uid), patch);
}

export function deleteMember(uid: string): Promise<void> {
  return deleteDoc(doc(db, 'users', uid));
}
