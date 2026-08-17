import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSprintContext } from '../../contexts/SprintContext';
import { useProjectMembers } from '../../hooks/useProjectMembers';
import { useSprints } from '../../hooks/useSprints';
import { useSprintNotes } from '../../hooks/useMemberSprintNotes';
import Avatar from '../Avatar';
import MemberNoteModal from './MemberNoteModal';
import { NOTE_RATINGS, type TeamMember } from '../../types';

/**
 * Chọn sprint → DANH SÁCH thành viên CỦA DỰ ÁN đang chọn; bấm một người → popup ghi NHẬT KÝ
 * (form luôn trống — mỗi lần lưu một dòng log, 0062; dòng preview hiện entry MỚI NHẤT).
 *
 * Sprint PHẢI lấy theo `projectId` của picker khu quản trị (useSprints), KHÔNG lấy từ
 * SprintContext: context theo dự án đang mở của APP — vào thẳng khu quản trị (chưa mở dự
 * án nào) là danh sách sprint trống dù picker đã chỉ rõ dự án. Members vẫn từ context
 * (profiles là toàn cục), lọc theo `project_members` qua useProjectMembers.
 */
export default function SprintNotesPanel({ projectId }: { projectId: string | null }) {
  const { profile, isAdmin } = useAuth();
  const { members } = useSprintContext();
  const { sprints, activeSprint } = useSprints(profile?.uid ?? '', projectId);
  const [sprintId, setSprintId] = useState('');
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const { memberships } = useProjectMembers(projectId);
  const { byMember } = useSprintNotes(sprintId || null, isAdmin);

  // Sprint tải async theo dự án: đổi dự án là useLiveQuery reset sprints về [] rồi nạp
  // list mới → effect này tự nhảy về sprint đang chạy (không có thì sprint mới nhất),
  // còn lựa chọn cũ vẫn hợp lệ thì giữ nguyên.
  useEffect(() => {
    setSprintId((cur) =>
      cur && sprints.some((s) => s.id === cur) ? cur : activeSprint?.id ?? sprints[0]?.id ?? '',
    );
  }, [sprints, activeSprint]);

  const projectMembers = useMemo(() => {
    const ids = new Set(memberships.map((m) => m.userId));
    return members.filter((m) => ids.has(m.uid));
  }, [members, memberships]);

  const sprintName = sprints.find((s) => s.id === sprintId)?.name ?? '';

  return (
    <div className="glass section" style={{ padding: '1.25rem', marginTop: '1rem' }}>
      <label className="field" style={{ maxWidth: 320 }}>
        <span>Sprint</span>
        <select className="select" value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
          {sprints.length === 0 && <option value="">— chưa có sprint —</option>}
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>

      {!projectId ? (
        <p className="muted">Chọn một dự án ở góc trên.</p>
      ) : !sprintId ? (
        <p className="muted">Chưa có sprint nào để ghi chú.</p>
      ) : projectMembers.length === 0 ? (
        <p className="muted">Dự án chưa có thành viên nào (thêm ở tab Thành viên của dự án).</p>
      ) : (
        <div className="note-list">
          {projectMembers.map((m) => {
            const note = byMember.get(m.uid);
            const r = note ? NOTE_RATINGS.find((x) => x.value === note.rating) : undefined;
            const preview = note ? (note.overview || note.highlights || note.concerns || '') : '';
            return (
              <button key={m.uid} type="button" className="note-list-row" onClick={() => setEditing(m)}>
                <Avatar name={m.displayName} photoURL={m.photoURL} size="sm" />
                <span className="nlr-name">{m.displayName}</span>
                {note ? (
                  <span className="nlr-preview">
                    {r && <span title={r.label} aria-hidden>{r.icon}</span>}
                    <span className="muted nlr-text">{preview || 'đã ghi chú'}</span>
                  </span>
                ) : (
                  <span className="muted nlr-empty">Chưa có ghi chú</span>
                )}
                <span className="nlr-caret" aria-hidden>✎</span>
              </button>
            );
          })}
        </div>
      )}

      {editing && sprintId && (
        <MemberNoteModal
          member={editing}
          sprintId={sprintId}
          sprintName={sprintName}
          authorId={profile?.uid ?? null}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
