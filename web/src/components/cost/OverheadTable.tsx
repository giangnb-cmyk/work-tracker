import { overheadItemTotal } from '../../lib/projectCost';
import { formatVnd } from '../../lib/format';
import { COST_ITEM_KINDS, COST_ITEM_KIND_LABEL, type CostItem, type CostItemKind } from '../../types';
import MoneyInput from './MoneyInput';
import TextCell from './TextCell';

interface Props {
  items: CostItem[];
  headcount: number;
  months: number;
  onAdd: () => void;
  onSeed: () => void;
  onUpdate: (
    id: string,
    patch: { name?: string; amount?: number; kind?: CostItemKind; perEmployee?: boolean },
  ) => void;
  onDelete: (id: string) => void;
}

/** Bảng chi phí thiết bị/vận hành: 1 lần hoặc theo năm; mỗi khoản có thể × số nhân sự. */
export default function OverheadTable({ items, headcount, months, onAdd, onSeed, onUpdate, onDelete }: Props) {
  return (
    <div className="glass section" style={{ padding: '1.25rem' }}>
      <div className="row between cost-section-head">
        <div>
          <h3>Chi phí thiết bị & vận hành</h3>
          <p className="muted cost-section-sub">
            “Ban đầu” tính 1 lần; “Theo năm” chia đều theo tháng. Tick “× đầu người” để nhân với số nhân sự.
          </p>
        </div>
        <div className="row" style={{ gap: '0.5rem' }}>
          {items.length === 0 && (
            <button className="btn-sm" onClick={onSeed}>Thêm mẫu (bảng gốc)</button>
          )}
          <button className="btn-primary btn-sm" onClick={onAdd}>+ Thêm khoản</button>
        </div>
      </div>

      <div className="table-container">
        <table className="data-table cost-table">
          <thead>
            <tr>
              <th>Khoản mục</th>
              <th className="cost-num-col">Số tiền</th>
              <th>Loại</th>
              <th className="cost-center-col">× đầu người</th>
              <th className="cost-num-col">Thành tiền ({months} tháng)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>
                  <TextCell
                    value={it.name}
                    onCommit={(v) => onUpdate(it.id, { name: v })}
                    placeholder="Tên khoản chi phí"
                    ariaLabel="Tên khoản chi phí"
                  />
                </td>
                <td className="cost-num-col">
                  <MoneyInput value={it.amount} onCommit={(n) => onUpdate(it.id, { amount: n })} ariaLabel={`Số tiền ${it.name}`} />
                </td>
                <td>
                  <select
                    className="select cost-kind-select"
                    value={it.kind}
                    onChange={(e) => onUpdate(it.id, { kind: e.target.value as CostItemKind })}
                    aria-label="Loại chi phí"
                  >
                    {COST_ITEM_KINDS.map((k) => (
                      <option key={k} value={k}>{COST_ITEM_KIND_LABEL[k]}</option>
                    ))}
                  </select>
                </td>
                <td className="cost-center-col">
                  <label className="cost-check" title={`Nhân với ${headcount} nhân sự`}>
                    <input
                      type="checkbox"
                      checked={it.perEmployee}
                      onChange={(e) => onUpdate(it.id, { perEmployee: e.target.checked })}
                    />
                    {it.perEmployee && <span className="muted cost-check-x">× {headcount}</span>}
                  </label>
                </td>
                <td className="cost-num-col mono">{formatVnd(overheadItemTotal(it, headcount, months))}</td>
                <td>
                  <button className="btn-sm btn-danger" onClick={() => onDelete(it.id)}>Gỡ</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  Chưa có khoản nào. Bấm “Thêm mẫu (bảng gốc)” để nạp sẵn Bộ PC, Ghế, Văn phòng…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
