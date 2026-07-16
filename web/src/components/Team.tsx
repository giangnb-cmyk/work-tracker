import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { deleteMember } from '../lib/memberWrites';
import Avatar from './Avatar';
import MemberModal from './MemberModal';
import ConfirmDialog from './ConfirmDialog';
import { formatDate } from '../lib/format';
import { JOB_ROLE_LABEL, type TeamMember } from '../types';

/** Team roster. Admins can add/edit/delete members; members see it read-only. */
export default function Team() {
  const { isAdmin } = useAuth();
  const { members, membersLoading } = useSprintContext();
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(m: TeamMember) {
    try {
      await deleteMember(m.uid);
      setRemoving(null);
    } catch (err) {
      console.error('Xoá thành viên thất bại', err);
      setRemoving(null);
      setError('Xoá thất bại (cần quyền admin).');
    }
  }

  if (membersLoading) {
    return (
      <div className="center-screen" style={{ minHeight: 200 }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="view-header row between">
        <div>
          <h1>Thành viên</h1>
          <p>{members.length} thành viên. Discord ID dùng để mention khi task hoàn thành.</p>
        </div>
        {isAdmin && (
          <button className="btn-primary" onClick={() => setAdding(true)}>+ Thêm thành viên</button>
        )}
      </div>

      <div className="glass table-container" style={{ padding: '0.5rem' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Thành viên</th>
              <th>Email</th>
              <th>Chuyên môn</th>
              <th>Vai trò</th>
              <th>Discord ID</th>
              <th>Notion</th>
              <th>Đăng nhập gần nhất</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.uid}>
                <td>
                  <div className="row">
                    <Avatar name={m.displayName} photoURL={m.photoURL} size="sm" />
                    {m.displayName}
                  </div>
                </td>
                <td className="muted">{m.email || '—'}</td>
                <td className="muted">{m.jobRole ? JOB_ROLE_LABEL[m.jobRole] : '—'}</td>
                <td>
                  <span className={`badge ${m.role === 'admin' ? 'status-active' : 'status-planning'}`}>
                    {m.role === 'admin' ? 'Admin' : 'Thành viên'}
                  </span>
                </td>
                <td className="muted mono" style={{ fontSize: '0.78rem' }}>{m.discordId || '—'}</td>
                <td className="muted">{m.notionUserId ? '✓' : '—'}</td>
                <td className="muted mono" style={{ fontSize: '0.78rem' }}>{formatDate(m.lastSeenAt)}</td>
                {isAdmin && (
                  <td>
                    <div className="row" style={{ gap: '0.35rem' }}>
                      <button className="btn-sm" onClick={() => setEditing(m)}>Sửa</button>
                      <button className="btn-sm btn-danger" onClick={() => setRemoving(m)}>Xoá</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!isAdmin && (
        <p className="muted" style={{ fontSize: '0.8rem', marginTop: '1rem' }}>
          Chỉ admin mới chỉnh sửa được thành viên. Thành viên mới tự xuất hiện sau lần đầu đăng nhập Google.
        </p>
      )}

      {error && <p className="error-text">{error}</p>}

      {adding && <MemberModal onClose={() => setAdding(false)} />}
      {editing && <MemberModal member={editing} onClose={() => setEditing(null)} />}

      {removing && (
        <ConfirmDialog
          title="Xoá thành viên?"
          message={<>Xoá <strong>“{removing.displayName}”</strong> khỏi danh sách thành viên.</>}
          detail="Task và bug của người này KHÔNG bị xoá, chỉ gỡ liên kết người nhận (tên cũ vẫn hiện trên thẻ). Nếu họ đăng nhập Google lại thì hồ sơ tự xuất hiện lại."
          confirmLabel="Xoá thành viên"
          onConfirm={() => handleDelete(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
