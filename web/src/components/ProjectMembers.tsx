import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useProjectMembers } from '../hooks/useProjectMembers';
import { useCostEmployees } from '../hooks/useCostEmployees';
import { removeProjectMember } from '../lib/projectMemberWrites';
import { upsertCostEmployee, type CostEmployeePatch } from '../lib/costWrites';
import Avatar from './Avatar';
import ConfirmDialog from './ConfirmDialog';
import MoneyInput from './cost/MoneyInput';
import ProjectMemberPicker from './ProjectMemberPicker';
import { JOB_ROLE_LABEL, USER_ROLE_LABEL, type TeamMember } from '../types';

/**
 * Thành viên CỦA DỰ ÁN đang chọn — danh sách tường minh (bảng project_members), không
 * suy từ task. Admin thêm người từ roster toàn web / gỡ ra; thành viên xem đọc-only.
 * Roster TOÀN BỘ (tạo/sửa hồ sơ, vai trò) nằm ở trang chọn dự án, không ở đây.
 */
export default function ProjectMembers() {
  const { isAdmin } = useAuth();
  const { members, membersLoading, selectedProjectId, selectedProject } = useSprintContext();
  const { memberships, loading: mLoading } = useProjectMembers(selectedProjectId);
  // Lương/ngày CHỈ nạp cho admin/owner (RLS admin-only) — member không mở socket thừa.
  const { employees: costRows, loading: costLoading } = useCostEmployees(selectedProjectId, isAdmin);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(members.map((m) => [m.uid, m])), [members]);
  const existingIds = useMemo(() => new Set(memberships.map((m) => m.userId)), [memberships]);
  const costByMember = useMemo(() => new Map(costRows.map((r) => [r.memberId, r])), [costRows]);

  async function saveCost(memberId: string, patch: CostEmployeePatch) {
    if (!selectedProjectId) return;
    try {
      await upsertCostEmployee(selectedProjectId, memberId, patch);
      setError(null);
    } catch (err) {
      console.error('Lưu lương/thời gian của thành viên thất bại', err);
      setError('Lưu lương thất bại (cần quyền admin).');
    }
  }

  // Ghép quan hệ thô với roster; hồ sơ đã xoá (còn trong bảng nhưng mất profiles) thì bỏ.
  const projectMembers = useMemo(
    () =>
      memberships
        .map((ms) => byId.get(ms.userId))
        .filter((m): m is TeamMember => Boolean(m))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi')),
    [memberships, byId],
  );

  async function handleRemove(m: TeamMember) {
    if (!selectedProjectId) return;
    try {
      await removeProjectMember(selectedProjectId, m.uid);
      setRemoving(null);
    } catch (err) {
      console.error('Gỡ thành viên khỏi dự án thất bại', err);
      setError('Gỡ thất bại (cần quyền admin).');
      setRemoving(null);
    }
  }

  if (membersLoading || mLoading || (isAdmin && costLoading)) {
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
          <h1>Thành viên dự án</h1>
          <p>
            {projectMembers.length} người trong “{selectedProject?.name ?? 'dự án'}”. Chỉ hiện người đã
            được thêm vào dự án.
            {isAdmin && ' Cột Lương / Bắt đầu / Kết thúc chỉ admin & owner thấy và sửa được.'}
          </p>
        </div>
        {isAdmin && (
          <button className="btn-primary" onClick={() => setAdding(true)}>+ Thêm thành viên</button>
        )}
      </div>

      {projectMembers.length === 0 ? (
        <div className="glass empty">
          Chưa có thành viên nào trong dự án.{' '}
          {isAdmin
            ? 'Bấm “Thêm thành viên” để chọn từ danh sách người đã vào web.'
            : 'Nhờ admin thêm bạn vào dự án nhé.'}
        </div>
      ) : (
        <div className="glass table-container" style={{ padding: '0.5rem' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Thành viên</th>
                <th>Email</th>
                <th>Chuyên môn</th>
                <th>Vai trò</th>
                <th>Discord ID</th>
                {isAdmin && (
                  <>
                    <th className="cost-num-col">Lương / tháng</th>
                    <th>Bắt đầu</th>
                    <th>Kết thúc</th>
                    <th></th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {projectMembers.map((m) => (
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
                    <span
                      className={`badge ${
                        m.role === 'owner' ? 'role-owner' : m.role === 'admin' ? 'status-active' : 'status-planning'
                      }`}
                    >
                      {USER_ROLE_LABEL[m.role]}
                    </span>
                  </td>
                  <td className="muted mono" style={{ fontSize: '0.78rem' }}>{m.discordId || '—'}</td>
                  {isAdmin && (
                    <>
                      <td className="cost-num-col">
                        <MoneyInput
                          value={costByMember.get(m.uid)?.monthlySalary ?? 0}
                          onCommit={(n) => saveCost(m.uid, { monthlySalary: n })}
                          ariaLabel={`Lương ${m.displayName}`}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          className="input cost-date"
                          value={costByMember.get(m.uid)?.startDate ?? ''}
                          onChange={(e) => saveCost(m.uid, { startDate: e.target.value || null })}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          className="input cost-date"
                          value={costByMember.get(m.uid)?.endDate ?? ''}
                          onChange={(e) => saveCost(m.uid, { endDate: e.target.value || null })}
                        />
                      </td>
                      <td>
                        <button className="btn-sm btn-danger" onClick={() => setRemoving(m)}>Gỡ</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isAdmin && (
        <p className="muted" style={{ fontSize: '0.8rem', marginTop: '1rem' }}>
          Chỉ admin mới thêm/gỡ thành viên của dự án. Quản lý hồ sơ (vai trò, Discord ID) nằm ở mục
          “Thành viên” trên trang chọn dự án.
        </p>
      )}

      {error && <p className="error-text">{error}</p>}

      {adding && selectedProjectId && (
        <ProjectMemberPicker
          projectId={selectedProjectId}
          existingIds={existingIds}
          onClose={() => setAdding(false)}
        />
      )}

      {removing && (
        <ConfirmDialog
          title="Gỡ khỏi dự án?"
          message={<>Gỡ <strong>“{removing.displayName}”</strong> khỏi dự án này.</>}
          detail="Task và bug của người này KHÔNG bị xoá. Có thể thêm lại bất cứ lúc nào."
          confirmLabel="Gỡ khỏi dự án"
          onConfirm={() => handleRemove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
