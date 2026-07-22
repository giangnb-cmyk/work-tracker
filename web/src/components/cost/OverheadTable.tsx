import { formatVnd } from '../../lib/format';
import { COST_ITEM_KINDS, COST_ITEM_KIND_LABEL, type CostItem, type CostItemKind } from '../../types';
import MoneyInput from './MoneyInput';
import TextCell from './TextCell';

interface Props {
  items: CostItem[];
  months: number;
  /** Thành tiền từng khoản (đã gộp mọi lượt gán) + số suất đang gán — từ overheadTotal. */
  totalByItem: Map<string, number>;
  countByItem: Map<string, number>;
  onAdd: () => void;
  onSeed: () => void;
  onUpdate: (id: string, patch: { name?: string; amount?: number; kind?: CostItemKind }) => void;
  onDelete: (id: string) => void;
}

/**
 * DANH MỤC chi phí thiết bị/vận hành (mô hình 0056): khoản ở đây được GÁN cho từng nhân sự
 * (bấm tên người ở bảng lương) hoặc từng dòng dự chi. Khoản chưa gán ai = chi phí chung,
 * tính một suất cho cả dự án.
 */
export default function OverheadTable({ items, months, totalByItem, countByItem, onAdd, onSeed, onUpdate, onDelete }: Props) {
  return (
    <div className="glass section" style={{ padding: '1.25rem' }}>
      <div className="row between cost-section-head">
        <div>
          <h3>Chi phí thiết bị &amp; vận hành</h3>
          <p className="muted cost-section-sub">
            Danh mục để gán: bấm tên nhân sự ở bảng lương (hoặc nút 🖥️ ở dự chi) để chọn khoản cho từng người.
            “Theo năm” tự chia theo số tháng làm việc; khoản chưa gán ai tính một suất chung cho dự án.
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
              <th className="cost-tight">Loại</th>
              <th className="cost-center-col">Đang gán</th>
              <th className="cost-num-col">Thành tiền ({months} tháng)</th>
              <th className="cost-tight"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const seats = countByItem.get(it.id) ?? 0;
              return (
                <tr key={it.id}>
                  <td>
                    <TextCell
                      value={it.name}
                      onCommit={(v) => onUpdate(it.id, { name: v })}
                      placeholder="Tên khoản chi phí"
                      className="cost-name"
                      ariaLabel="Tên khoản chi phí"
                    />
                  </td>
                  <td className="cost-num-col">
                    <MoneyInput value={it.amount} onCommit={(n) => onUpdate(it.id, { amount: n })} ariaLabel={`Số tiền ${it.name}`} />
                  </td>
                  <td className="cost-tight">
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
                    {seats > 0
                      ? <span className="badge status-active">{seats} suất</span>
                      : <span className="muted" title="Chưa gán ai — tính một suất chung cho dự án">chung</span>}
                  </td>
                  <td className="cost-num-col mono">{formatVnd(totalByItem.get(it.id) ?? 0)}</td>
                  <td className="cost-tight">
                    <button className="btn-sm btn-danger" onClick={() => onDelete(it.id)}>Gỡ</button>
                  </td>
                </tr>
              );
            })}
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
