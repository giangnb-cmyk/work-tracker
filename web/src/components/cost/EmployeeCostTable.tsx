import { activeMonths } from '../../lib/projectCost';
import { formatVnd } from '../../lib/format';
import type { CostEmployee, TeamMember } from '../../types';
import Avatar from '../Avatar';

interface Props {
  employees: CostEmployee[];
  memberById: Map<string, TeamMember>;
  anchor: number;
  months: number;
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' (— nếu rỗng). */
function fmtDate(d: string | null): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

/**
 * Bảng lương của dự án — CHỈ ĐỌC. Lương/ngày được điền ở tab Thành viên (khu quản trị);
 * ở đây chỉ hiển thị và cộng vào tổng theo số tháng đang chọn.
 */
export default function EmployeeCostTable({ employees, memberById, anchor, months }: Props) {
  return (
    <div className="glass section" style={{ padding: '1.25rem' }}>
      <div className="cost-section-head">
        <h3>Lương nhân sự</h3>
        <p className="muted cost-section-sub">
          Số liệu lấy từ tab <strong>Thành viên</strong> — vào đó để điền/sửa lương và ngày vào–ra.
        </p>
      </div>

      <div className="table-container">
        <table className="data-table cost-table">
          <thead>
            <tr>
              <th>Nhân viên</th>
              <th className="cost-num-col">Lương / tháng</th>
              <th>Bắt đầu</th>
              <th>Kết thúc</th>
              <th className="cost-num-col">Số tháng</th>
              <th className="cost-num-col">Thành tiền ({months} tháng)</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const m = memberById.get(e.memberId);
              const active = activeMonths(e, anchor, months);
              const name = m?.displayName || m?.email || 'Đã rời dự án';
              return (
                <tr key={e.id}>
                  <td>
                    <div className="row">
                      <Avatar name={name} photoURL={m?.photoURL} size="sm" />
                      {name}
                    </div>
                  </td>
                  <td className="cost-num-col mono">{formatVnd(e.monthlySalary)}</td>
                  <td className="muted mono" style={{ fontSize: '0.82rem' }}>{fmtDate(e.startDate)}</td>
                  <td className="muted mono" style={{ fontSize: '0.82rem' }}>{fmtDate(e.endDate)}</td>
                  <td className="cost-num-col mono muted">{active}</td>
                  <td className="cost-num-col mono">{formatVnd(e.monthlySalary * active)}</td>
                </tr>
              );
            })}
            {employees.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  Chưa ai được điền lương cho dự án này. Vào tab <strong>Thành viên</strong> để điền.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
