import { useMemo } from 'react';
import Avatar from './Avatar';
import { formatIsoDate, formatVnd, tenureVi } from '../lib/format';
import { JOB_ROLE_LABEL, type MemberComp, type TeamMember } from '../types';

interface Props {
  members: TeamMember[];
  compByMember: Map<string, MemberComp>;
  loading: boolean;
  /** Bấm một hàng → mở chi tiết thành viên (nơi điền lương/ngày). */
  onEdit: (m: TeamMember) => void;
}

interface Row {
  member: TeamMember;
  comp: MemberComp | undefined;
}

/** Còn làm việc = chưa có ngày kết thúc, hoặc ngày kết thúc ở tương lai. */
function isWorking(comp: MemberComp | undefined): boolean {
  if (!comp?.endDate) return true;
  return new Date(`${comp.endDate}T00:00:00`) >= new Date();
}

/** Sắp theo ngày vào (sớm trước, chưa điền xuống cuối), rồi theo tên. */
function byStart(a: Row, b: Row): number {
  const sa = a.comp?.startDate ?? '9999-99-99';
  const sb = b.comp?.startDate ?? '9999-99-99';
  return sa !== sb ? sa.localeCompare(sb) : a.member.displayName.localeCompare(b.member.displayName, 'vi');
}

function SalaryTable({ rows, onEdit }: { rows: Row[]; onEdit: (m: TeamMember) => void }) {
  return (
    <div className="glass table-container" style={{ padding: '0.5rem', marginBottom: '1.5rem' }}>
      <table className="data-table cost-table">
        <thead>
          <tr>
            <th>Thành viên</th>
            <th className="cost-tight">Chuyên môn</th>
            <th className="cost-num-col">Lương / tháng</th>
            <th className="cost-tight">Bắt đầu</th>
            <th className="cost-tight">Kết thúc</th>
            <th className="cost-tight">Thâm niên</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ member: m, comp }) => (
            <tr key={m.uid} className="tsal-row" onClick={() => onEdit(m)} title="Mở hồ sơ để sửa lương / ngày">
              <td>
                <div className="row">
                  <Avatar name={m.displayName} photoURL={m.photoURL} size="sm" />
                  {m.displayName}
                </div>
              </td>
              <td className="cost-tight muted">{m.jobRole ? JOB_ROLE_LABEL[m.jobRole] : '—'}</td>
              <td className="cost-num-col mono">{comp && comp.monthlySalary > 0 ? formatVnd(comp.monthlySalary) : '—'}</td>
              <td className="cost-tight muted mono" style={{ fontSize: '0.82rem' }}>{formatIsoDate(comp?.startDate)}</td>
              <td className="cost-tight muted mono" style={{ fontSize: '0.82rem' }}>{formatIsoDate(comp?.endDate)}</td>
              <td className="cost-tight mono">{tenureVi(comp?.startDate, comp?.endDate)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="empty">Trống.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Màn "Lương" của tab Thành viên (khu quản trị) — chỉ admin/owner. Nhóm như bảng Notion cũ:
 * ĐANG LÀM VIỆC (chưa có ngày kết thúc) rồi ĐÃ NGHỈ; thâm niên tính đến hôm nay (đang làm)
 * hoặc đến ngày nghỉ. Chỉ ĐỌC — bấm hàng để mở hồ sơ (MemberModal) sửa lương/ngày.
 */
export default function TeamSalary({ members, compByMember, loading, onEdit }: Props) {
  const { working, stopped } = useMemo(() => {
    const rows: Row[] = members.map((m) => ({ member: m, comp: compByMember.get(m.uid) }));
    rows.sort(byStart);
    return {
      working: rows.filter((r) => isWorking(r.comp)),
      stopped: rows.filter((r) => !isWorking(r.comp)),
    };
  }, [members, compByMember]);

  if (loading) {
    return (
      <div className="center-screen" style={{ minHeight: 160 }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div>
      <div className="tsal-group-head">🟢 Đang làm việc <span className="muted">({working.length})</span></div>
      <SalaryTable rows={working} onEdit={onEdit} />
      {stopped.length > 0 && (
        <>
          <div className="tsal-group-head">⚪ Đã nghỉ <span className="muted">({stopped.length})</span></div>
          <SalaryTable rows={stopped} onEdit={onEdit} />
        </>
      )}
    </div>
  );
}
