import { useSprintContext } from '../contexts/SprintContext';
import Avatar from './Avatar';
import { formatDate } from '../lib/format';

/** Team roster. Shows role and whether a member is linked to Discord/Notion. */
export default function Team() {
  const { members, membersLoading } = useSprintContext();

  if (membersLoading) {
    return (
      <div className="center-screen" style={{ minHeight: 200 }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="view-header">
        <h1>Thành viên</h1>
        <p>{members.length} thành viên đã đăng nhập.</p>
      </div>

      <div className="glass table-container" style={{ padding: '0.5rem' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Thành viên</th>
              <th>Email</th>
              <th>Vai trò</th>
              <th>Discord</th>
              <th>Notion</th>
              <th>Đăng nhập gần nhất</th>
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
                <td className="muted">{m.email}</td>
                <td>
                  <span className={`badge ${m.role === 'admin' ? 'status-active' : 'status-planning'}`}>
                    {m.role === 'admin' ? 'Admin' : 'Thành viên'}
                  </span>
                </td>
                <td className="muted mono" style={{ fontSize: '0.78rem' }}>{m.discordId || '—'}</td>
                <td className="muted">{m.notionUserId ? '✓' : '—'}</td>
                <td className="muted mono" style={{ fontSize: '0.78rem' }}>{formatDate(m.lastSeenAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: '0.8rem', marginTop: '1rem' }}>
        Để cấp quyền admin hoặc liên kết Discord/Notion, sửa trường <span className="mono">role</span> /{' '}
        <span className="mono">discordId</span> / <span className="mono">notionUserId</span> của user trong
        Firebase Console (xem <span className="mono">DATA_MODEL.md</span>).
      </p>
    </div>
  );
}
