import { activeMonths } from '../../lib/projectCost';
import { formatVnd } from '../../lib/format';
import type { CostEmployeeRow } from '../../types';
import Avatar from '../Avatar';

interface Props {
  employees: CostEmployeeRow[];
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
 * Bảng lương của dự án — CHỈ ĐỌC. Mỗi dòng = một thành viên dự án + lương TOÀN CỤC của họ
 * (điền ở chi tiết thành viên, tab Thành viên). Ở đây chỉ hiển thị và cộng vào tổng.
 */
export default function EmployeeCostTable({ employees, anchor, months }: Props) {
  return (
    <div className="glass section" style={{ padding: '1.25rem' }}>
      <div className="cost-section-head">
        <h3>Lương nhân sự</h3>
        <p className="muted cost-section-sub">
          Danh sách = thành viên của dự án; lương/ngày lấy từ chi tiết mỗi người ở tab{' '}
          <strong>Thành viên</strong>. Vào đó để điền/sửa.
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
              const active = activeMonths(e, anchor, months);
              return (
                <tr key={e.memberId}>
                  <td>
                    <div className="row">
                      <Avatar name={e.name} photoURL={e.photoURL} size="sm" />
                      {e.name}
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
                  Dự án chưa có thành viên. Thêm người ở tab Thành viên của dự án, rồi điền lương ở chi tiết.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
