import { useMemo, useState } from 'react';
import { useSprintContext } from '../contexts/SprintContext';
import { useAuditLog } from '../hooks/useAuditLog';
import { timeAgo } from '../lib/format';
import Avatar from './Avatar';
import { AUDIT_ACTION_META, MEMBER_PERMS, type AuditEntry } from '../types';

const PERM_LABEL: Record<string, string> = Object.fromEntries(MEMBER_PERMS.map((p) => [p.id, p.label]));
const ROLE_LABEL: Record<string, string> = { admin: 'Admin', member: 'Thành viên' };

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

/**
 * Diff của một dòng member.perms → các "viên" thay đổi (vai trò + quyền lẻ thêm/bớt).
 * Trả mảng rỗng nếu không dựng được gì đọc được (dòng cũ thiếu meta chẳng hạn).
 */
function permChanges(meta: Record<string, unknown>): { text: string; kind: 'add' | 'rm' | 'role' }[] {
  const out: { text: string; kind: 'add' | 'rm' | 'role' }[] = [];
  const roleOld = meta.role_old as string | null;
  const roleNew = meta.role_new as string | null;
  if (roleNew && roleOld && roleNew !== roleOld) {
    out.push({ text: `Vai trò: ${ROLE_LABEL[roleOld] ?? roleOld} → ${ROLE_LABEL[roleNew] ?? roleNew}`, kind: 'role' });
  }
  const before = strArray(meta.perms_old);
  const after = strArray(meta.perms_new);
  for (const p of after) if (!before.includes(p)) out.push({ text: `+ ${PERM_LABEL[p] ?? p}`, kind: 'add' });
  for (const p of before) if (!after.includes(p)) out.push({ text: `− ${PERM_LABEL[p] ?? p}`, kind: 'rm' });
  return out;
}

/** Gộp các trường tìm kiếm được của một dòng thành chuỗi thường để so khớp. */
function haystack(e: AuditEntry): string {
  const memberName = typeof e.meta.member_name === 'string' ? e.meta.member_name : '';
  return `${e.summary} ${e.actorName} ${memberName}`.toLowerCase();
}

/** Nhật ký hệ thống — ai xoá task, tạo feature, đổi quyền member (chỉ admin; chặn ở Sidebar + Layout). */
export default function SystemLog() {
  const { members } = useSprintContext();
  const { entries, loading } = useAuditLog();
  const [filter, setFilter] = useState<string | 'all'>('all');
  const [query, setQuery] = useState('');

  // Ảnh đại diện người thực hiện — tra theo actorId; không có (Bot / hồ sơ đã xoá) thì để trống.
  const photoById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of members) if (p.photoURL) m.set(p.uid, p.photoURL);
    return m;
  }, [members]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(
      (e) => (filter === 'all' || e.action === filter) && (!q || haystack(e).includes(q)),
    );
  }, [entries, filter, query]);

  if (loading) {
    return <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>;
  }

  return (
    <div className="fade-in">
      <div className="view-header">
        <h1>🖥️ Hệ thống</h1>
        <p>Nhật ký hệ thống — chỉ admin xem được. Ghi lại ai xoá task, ai tạo feature, ai đổi vai trò/quyền của thành viên.</p>
      </div>

      <div className="log-controls">
        <div className="log-filters">
          <button className={`chip${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>
            Tất cả
          </button>
          {Object.entries(AUDIT_ACTION_META).map(([action, meta]) => (
            <button
              key={action}
              className={`chip${filter === action ? ' on' : ''}`}
              onClick={() => setFilter(action)}
            >
              {meta.icon} {meta.label}
            </button>
          ))}
        </div>
        <div className="log-search">
          <span className="log-search-icon" aria-hidden>🔍</span>
          <input
            className="input"
            type="search"
            placeholder="Tìm theo nội dung, người thực hiện, thành viên…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="glass empty">
          {entries.length === 0
            ? 'Chưa có hoạt động nào được ghi. Nhật ký chỉ bắt đầu từ khi tính năng lên production.'
            : 'Không có mục nào khớp bộ lọc.'}
        </div>
      ) : (
        <div className="log-list glass">
          {shown.map((e) => (
            <LogRow key={e.id} entry={e} photo={e.actorId ? photoById.get(e.actorId) : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

function LogRow({ entry, photo }: { entry: AuditEntry; photo?: string }) {
  const meta = AUDIT_ACTION_META[entry.action] ?? { label: entry.action, icon: '•', tone: 'warn' as const };
  const changes = entry.action === 'member.perms' ? permChanges(entry.meta) : [];

  return (
    <div className="log-row">
      <span className={`log-badge tone-${meta.tone}`} title={meta.label}>
        {meta.icon}
      </span>
      <div className="log-main">
        <div className="log-summary">{entry.summary}</div>
        {changes.length > 0 && (
          <div className="log-diff">
            {changes.map((c, i) => (
              <span key={i} className={`log-diff-item diff-${c.kind}`}>{c.text}</span>
            ))}
          </div>
        )}
        <div className="log-meta muted">
          <span className="log-actor">
            <Avatar name={entry.actorName || 'Hệ thống'} photoURL={photo} size="sm" />
            {entry.actorName || 'Hệ thống'}
          </span>
          <span aria-hidden>·</span>
          <span>{timeAgo(entry.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}
