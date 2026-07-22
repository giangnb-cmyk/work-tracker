import { activeMonths, overheadForEmployee } from '../../lib/projectCost';
import { formatIsoDate, formatVnd } from '../../lib/format';
import type { CostEmployeeRow, CostItem } from '../../types';
import Avatar from '../Avatar';

interface Props {
  employees: CostEmployeeRow[];
  itemById: Map<string, CostItem>;
  /** memberId → các khoản chi phí đã gán cho người đó. */
  memberItemIds: Map<string, string[]>;
  anchor: number;
  months: number;
  /** Bấm một hàng → mở popup gán khoản chi phí cho người đó. */
  onPick: (e: CostEmployeeRow) => void;
}

/**
 * Bảng lương của dự án. Lương/ngày CHỈ ĐỌC (điền ở chi tiết thành viên); bấm hàng để GÁN
 * khoản thiết bị/vận hành cho người đó (mô hình 0056). Cột TB&VH = tổng khoản đã gán,
 * khoản theo năm chia theo số tháng người đó làm việc trong cửa sổ.
 */
export default function EmployeeCostTable({ employees, itemById, memberItemIds, anchor, months, onPick }: Props) {
  return (
    <div className="glass section" style={{ padding: '1.25rem' }}>
      <div className="cost-section-head">
        <h3>Lương nhân sự</h3>
        <p className="muted cost-section-sub">
          Lương/ngày lấy từ tab <strong>Thành viên</strong> (mở chi tiết người để sửa). Bấm một hàng để
          <strong> gán khoản thiết bị/vận hành</strong> cho người đó.
        </p>
      </div>

      <div className="table-container">
        <table className="data-table cost-table">
          <thead>
            <tr>
              <th>Nhân viên</th>
              <th className="cost-num-col">Lương / tháng</th>
              <th className="cost-tight">Bắt đầu</th>
              <th className="cost-tight">Kết thúc</th>
              <th className="cost-num-col">Số tháng</th>
              <th className="cost-num-col">TB &amp; VH</th>
              <th className="cost-num-col">Thành tiền ({months} tháng)</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const active = activeMonths(e, anchor, months);
              const ids = memberItemIds.get(e.memberId) ?? [];
              const gear = overheadForEmployee(ids, itemById, active);
              return (
                <tr key={e.memberId} className="tsal-row" onClick={() => onPick(e)} title="Gán khoản thiết bị / vận hành">
                  <td>
                    <div className="row">
                      <Avatar name={e.name} photoURL={e.photoURL} size="sm" />
                      {e.name}
                      {ids.length > 0 && <span className="muted cost-gear-chip">🖥️ {ids.length}</span>}
                    </div>
                  </td>
                  <td className="cost-num-col mono">{formatVnd(e.monthlySalary)}</td>
                  <td className="cost-tight muted mono" style={{ fontSize: '0.82rem' }}>{formatIsoDate(e.startDate)}</td>
                  <td className="cost-tight muted mono" style={{ fontSize: '0.82rem' }}>{formatIsoDate(e.endDate)}</td>
                  <td className="cost-num-col mono muted">{active}</td>
                  <td className="cost-num-col mono">{gear > 0 ? formatVnd(gear) : '—'}</td>
                  <td className="cost-num-col mono">{formatVnd(e.monthlySalary * active + gear)}</td>
                </tr>
              );
            })}
            {employees.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
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
