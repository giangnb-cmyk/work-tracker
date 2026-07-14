// Pure formatting helpers — no side effects, easy to test.

import type { Timestamp } from 'firebase/firestore';

export function tsToDate(ts: Timestamp | null | undefined): Date | null {
  return ts ? ts.toDate() : null;
}

export function formatDate(ts: Timestamp | null | undefined): string {
  const d = tsToDate(ts);
  if (!d) return '—';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function toInputDate(ts: Timestamp | null | undefined): string {
  const d = tsToDate(ts);
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

/** Whole days from now until `ts` (negative = overdue). */
export function daysUntil(ts: Timestamp | null | undefined): number | null {
  const d = tsToDate(ts);
  if (!d) return null;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
