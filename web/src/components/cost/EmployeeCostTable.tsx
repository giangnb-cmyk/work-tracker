import { activeMonths, overheadForEmployee } from '../../lib/projectCost';
import { formatIsoDate, formatVnd } from '../../lib/format';
import type { CostEmployeeRow, CostItem } from '../../types';
import Avatar from '../Avatar';

interface Props {
  employees: CostEmployeeRow[];
  itemById: Map<string, CostItem>;
  /** memberId → các khoản chi phí đã gán cho người đó. */
  memberItemIds: Map<string, string[]>;
  /** Tổng SUẤT tuyển thêm ở Dự chi (Σ head_count các dòng hire) — đếm cạnh số người thật. */
  hireCount: number;
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
export default function EmployeeCostTable({ employees, itemById, memberItemIds, hireCount, anchor, months, onPick }: Props) {
  // Tính trước từng hàng MỘT lần để thân bảng và hàng TỔNG dùng chung một con số.
  const rows = employees.map((e) => {
    const active = activeMonths(e, anchor, months);
    const ids = memberItemIds.get(e.memberId) ?? [];
    const gear = overheadForEmployee(ids, itemById, active);
    return { e, active, ids, gear, total: e.monthlySalary * active + gear };
  });
  const totMonthly = rows.reduce((s, r) => s + r.e.monthlySalary, 0);
  const totGear = rows.reduce((s, r) => s + r.gear, 0);
  const totAll = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="glass section" style={{ padding: '1.25rem' }}>
      <div className="cost-section-head">
        <h3>
          Chi phí nhân sự
          <span className="cost-headcount">
            👥 {employees.length} người
            {hireCount > 0 && <span className="muted"> · dự tuyển thêm {hireCount} (dự chi)</span>}
          </span>
        </h3>
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
            {rows.map(({ e, active, ids, gear, total }) => (
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
                <td className="cost-num-col mono">{formatVnd(total)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  Dự án chưa có thành viên. Thêm người ở tab Thành viên của dự án, rồi điền lương ở chi tiết.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="cost-foot-row">
                <td className="cost-foot-label">Tổng ({rows.length} người) · {months} tháng</td>
                <td className="cost-num-col mono cost-foot-total">{formatVnd(totMonthly)}</td>
                <td colSpan={3}></td>
                <td className="cost-num-col mono cost-foot-total">{formatVnd(totGear)}</td>
                <td className="cost-num-col mono cost-foot-total">{formatVnd(totAll)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
