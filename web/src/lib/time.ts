// Lightweight Timestamp shim so the app keeps its `.toDate()` / `.toMillis()` /
// `Timestamp.fromDate()` API after moving off Firestore. Supabase returns
// timestamptz as ISO strings; we wrap them here and serialize back to ISO on write.

export class Timestamp {
  private constructor(private readonly ms: number) {}

  toDate(): Date {
    return new Date(this.ms);
  }
  toMillis(): number {
    return this.ms;
  }
  toISOString(): string {
    return new Date(this.ms).toISOString();
  }

  static fromDate(d: Date): Timestamp {
    return new Timestamp(d.getTime());
  }
  static now(): Timestamp {
    return new Timestamp(Date.now());
  }
  /** Parse an ISO string (or null) from Postgres into a Timestamp. */
  static fromISO(s: string | null | undefined): Timestamp | null {
    if (!s) return null;
    const ms = Date.parse(s);
    return Number.isNaN(ms) ? null : new Timestamp(ms);
  }
}

/** Serialize a Timestamp/Date to an ISO string for a Postgres timestamptz column. */
export function toISO(v: Timestamp | Date | null | undefined): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : v.toISOString();
}
