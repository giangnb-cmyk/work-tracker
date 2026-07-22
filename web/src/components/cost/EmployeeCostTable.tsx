import { useMemo } from 'react';
import { activeMonths } from '../../lib/projectCost';
import { formatVnd } from '../../lib/format';
import type { CostEmployee, TeamMember } from '../../types';
import Avatar from '../Avatar';
import SearchableSelect from '../SearchableSelect';
import MoneyInput from './MoneyInput';

interface Props {
  employees: CostEmployee[];
  memberById: Map<string, TeamMember>;
  /** Thành viên dự án CHƯA có trong bảng lương — nguồn cho ô "Thêm từ thành viên". */
  available: TeamMember[];
  anchor: number;
  months: number;
  onAdd: (memberId: string) => void;
  onUpdate: (id: string, patch: { monthlySalary?: number; startDate?: string | null; endDate?: string | null }) => void;
  onDelete: (id: string) => void;
}

/** Bảng lương thực tế: mỗi dòng là một thành viên dự án + lương/tháng + ngày vào/ra. */
export default function EmployeeCostTable({
  employees,
  memberById,
  available,
  anchor,
  months,
  onAdd,
  onUpdate,
  onDelete,
}: Props) {
  const options = useMemo(
    () =>
      available
        .map((m) => ({ value: m.uid, label: m.displayName || m.email || m.uid }))
        .sort((a, b) => a.label.localeCompare(b.label, 'vi')),
    [available],
  );

  return (
    <div className="glass section cost-emp-card" style={{ padding: '1.25rem' }}>
      <div className="row between cost-section-head">
        <div>
          <h3>Lương nhân sự</h3>
          <p className="muted cost-section-sub">Chọn người từ thành viên dự án rồi điền lương/tháng và ngày vào — ra.</p>
        </div>
        <div className="cost-add-member">
          <SearchableSelect
            value=""
            onChange={(v) => v && onAdd(v)}
            options={options}
            placeholder={options.length ? '+ Thêm từ thành viên' : 'Đã thêm hết thành viên'}
            disabled={options.length === 0}
            panel="overlay"
          />
        </div>
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
              <th></th>
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
                  <td className="cost-num-col">
                    <MoneyInput
                      value={e.monthlySalary}
                      onCommit={(n) => onUpdate(e.id, { monthlySalary: n })}
                      ariaLabel={`Lương của ${name}`}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      className="input cost-date"
                      value={e.startDate ?? ''}
                      onChange={(ev) => onUpdate(e.id, { startDate: ev.target.value || null })}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      className="input cost-date"
                      value={e.endDate ?? ''}
                      onChange={(ev) => onUpdate(e.id, { endDate: ev.target.value || null })}
                    />
                  </td>
                  <td className="cost-num-col mono muted">{active}</td>
                  <td className="cost-num-col mono">{formatVnd(e.monthlySalary * active)}</td>
                  <td>
                    <button className="btn-sm btn-danger" onClick={() => onDelete(e.id)}>Gỡ</button>
                  </td>
                </tr>
              );
            })}
            {employees.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">Chưa có nhân sự nào. Bấm “+ Thêm từ thành viên”.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
