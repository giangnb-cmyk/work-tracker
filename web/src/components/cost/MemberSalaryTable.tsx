import { useMemo, useState } from 'react';
import { useSprintContext } from '../../contexts/SprintContext';
import { useProjectMembers } from '../../hooks/useProjectMembers';
import { useCostEmployees } from '../../hooks/useCostEmployees';
import { upsertCostEmployee, type CostEmployeePatch } from '../../lib/costWrites';
import type { TeamMember } from '../../types';
import Avatar from '../Avatar';
import MoneyInput from './MoneyInput';

/**
 * Bảng điền LƯƠNG + ngày vào–ra của từng thành viên trong MỘT dự án (dùng ở tab Thành viên,
 * khu quản trị). Chỉ liệt kê người thuộc dự án đã chọn; sửa-trên-ô, upsert theo (dự án, người).
 * Admin-only (RLS chặn thật) — component chỉ dựng khi người xem là admin.
 */
export default function MemberSalaryTable({ projectId }: { projectId: string }) {
  const { members } = useSprintContext();
  const { memberships, loading: mLoading } = useProjectMembers(projectId);
  const { employees: costRows, loading: costLoading } = useCostEmployees(projectId);
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(members.map((m) => [m.uid, m])), [members]);
  const costByMember = useMemo(() => new Map(costRows.map((r) => [r.memberId, r])), [costRows]);

  const projectMembers = useMemo(
    () =>
      memberships
        .map((ms) => byId.get(ms.userId))
        .filter((m): m is TeamMember => Boolean(m))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi')),
    [memberships, byId],
  );

  async function saveCost(memberId: string, patch: CostEmployeePatch) {
    try {
      await upsertCostEmployee(projectId, memberId, patch);
      setError(null);
    } catch (err) {
      console.error('Lưu lương thành viên thất bại', err);
      setError('Lưu lương thất bại (cần quyền admin).');
    }
  }

  if (mLoading || costLoading) {
    return (
      <div className="center-screen" style={{ minHeight: 120 }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <>
      <div className="glass table-container" style={{ padding: '0.5rem' }}>
        <table className="data-table cost-table">
          <thead>
            <tr>
              <th>Thành viên</th>
              <th className="cost-num-col">Lương / tháng</th>
              <th>Bắt đầu</th>
              <th>Kết thúc</th>
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
              </tr>
            ))}
            {projectMembers.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">Dự án chưa có thành viên. Thêm người ở tab dự án trước.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {error && <p className="error-text">{error}</p>}
    </>
  );
}
