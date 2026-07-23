import { employerBhxh, projectionLineTotal, projectionTotal } from '../../lib/projectCost';
import { formatVnd } from '../../lib/format';
import {
  COST_CADENCES,
  COST_CADENCE_LABEL,
  COST_PROJECTION_KIND_ICON,
  COST_PROJECTION_KIND_LABEL,
  type CostCadence,
  type CostProjection,
  type CostProjectionKind,
} from '../../types';
import MoneyInput from './MoneyInput';
import NumberCell from './NumberCell';
import TextCell from './TextCell';

interface Props {
  projections: CostProjection[];
  months: number;
  onAdd: (kind: CostProjectionKind) => void;
  onUpdate: (
    id: string,
    patch: { label?: string; amount?: number; cadence?: CostCadence; headCount?: number },
  ) => void;
  onDelete: (id: string) => void;
  /** Mở popup gán khoản thiết bị/vận hành cho dòng dự chi này (mỗi suất một bộ). */
  onPickItems: (p: CostProjection) => void;
}

/** Bảng DỰ CHI (what-if): tuyển thêm vị trí X lương Y + các khoản Outsource. */
export default function ProjectionTable({ projections, months, onAdd, onUpdate, onDelete, onPickItems }: Props) {
  const total = projectionTotal(projections, months);
  /** BHXH Cty của MỘT dòng trong cả khoảng: chỉ suất TUYỂN trả lương THÁNG (outsource không
   *  đóng). Con số này nằm ở thẻ 🛡️ BHXH — hiện thêm ở đây để dòng tuyển không "thiếu" phí. */
  const bhxhFor = (p: CostProjection) =>
    p.kind === 'hire' && p.cadence === 'monthly' ? employerBhxh(p.amount) * p.headCount * months : 0;
  const totalBhxh = projections.reduce((s, p) => s + bhxhFor(p), 0);

  return (
    <div className="glass section" style={{ padding: '1.25rem' }}>
      <div className="row between cost-section-head">
        <div>
          <h3>Dự chi (mô phỏng)</h3>
          <p className="muted cost-section-sub">
            Thử “tuyển thêm vị trí X lương Y” hoặc thuê ngoài, xem tốn thêm bao nhiêu trong {months} tháng.
          </p>
        </div>
        <div className="row" style={{ gap: '0.5rem' }}>
          <button className="btn-sm" onClick={() => onAdd('hire')}>+ Tuyển thêm</button>
          <button className="btn-sm" onClick={() => onAdd('outsource')}>+ Outsource</button>
        </div>
      </div>

      <div className="table-container">
        <table className="data-table cost-table">
          <thead>
            <tr>
              <th className="cost-tight">Loại</th>
              <th>Vị trí / Mô tả</th>
              <th className="cost-num-col">Số tiền</th>
              <th className="cost-tight">Nhịp</th>
              <th className="cost-center-col">Số người</th>
              <th className="cost-num-col">Thành tiền ({months} tháng)</th>
              <th className="cost-tight"></th>
            </tr>
          </thead>
          <tbody>
            {projections.map((p) => (
              <tr key={p.id}>
                <td className="cost-tight">
                  <span className={`badge cost-kind-badge cost-kind-${p.kind}`}>
                    {COST_PROJECTION_KIND_ICON[p.kind]} {COST_PROJECTION_KIND_LABEL[p.kind]}
                  </span>
                </td>
                <td>
                  <TextCell
                    value={p.label}
                    onCommit={(v) => onUpdate(p.id, { label: v })}
                    placeholder={p.kind === 'hire' ? 'VD: Dev Unity' : 'VD: Dựng mô hình 3D'}
                    className="cost-name"
                    ariaLabel="Mô tả dự chi"
                  />
                </td>
                <td className="cost-num-col">
                  <MoneyInput value={p.amount} onCommit={(n) => onUpdate(p.id, { amount: n })} ariaLabel={`Số tiền ${p.label}`} />
                </td>
                <td className="cost-tight">
                  <select
                    className="select cost-kind-select"
                    value={p.cadence}
                    onChange={(e) => onUpdate(p.id, { cadence: e.target.value as CostCadence })}
                    aria-label="Nhịp phát sinh"
                  >
                    {COST_CADENCES.map((c) => (
                      <option key={c} value={c}>{COST_CADENCE_LABEL[c]}</option>
                    ))}
                  </select>
                </td>
                <td className="cost-center-col">
                  <NumberCell
                    value={p.headCount}
                    onCommit={(n) => onUpdate(p.id, { headCount: n })}
                    min={1}
                    className="cost-count-input"
                    ariaLabel="Số người / số suất"
                  />
                </td>
                <td className="cost-num-col mono">
                  {formatVnd(projectionLineTotal(p, months))}
                  {bhxhFor(p) > 0 && (
                    <div className="muted cost-proj-bhxh" title="BHXH/BHYT/BHTN phần công ty đóng cho các suất tuyển này — đã cộng ở thẻ 🛡️ BHXH">
                      +🛡️ {formatVnd(bhxhFor(p))}
                    </div>
                  )}
                </td>
                <td className="cost-tight">
                  <div className="row-actions">
                    <button
                      className="btn-sm"
                      onClick={() => onPickItems(p)}
                      title="Gán khoản thiết bị / vận hành cho mỗi suất"
                    >
                      🖥️ {p.itemIds.length || '+'}
                    </button>
                    <button className="btn-sm btn-danger" onClick={() => onDelete(p.id)}>Gỡ</button>
                  </div>
                </td>
              </tr>
            ))}
            {projections.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">Chưa có dự chi. Bấm “+ Tuyển thêm” hoặc “+ Outsource”.</td>
              </tr>
            )}
          </tbody>
          {projections.length > 0 && (
            <tfoot>
              <tr className="cost-foot-row">
                <td colSpan={5} className="cost-foot-label">Tổng dự chi trong {months} tháng</td>
                <td className="cost-num-col mono cost-foot-total">{formatVnd(total)}</td>
                <td></td>
              </tr>
              {totalBhxh > 0 && (
                <tr>
                  <td colSpan={5} className="cost-foot-label" style={{ borderBottom: 'none' }}>
                    🛡️ BHXH Cty cho các suất tuyển (tính ở thẻ BHXH)
                  </td>
                  <td className="cost-num-col mono muted" style={{ borderBottom: 'none' }}>{formatVnd(totalBhxh)}</td>
                  <td style={{ borderBottom: 'none' }}></td>
                </tr>
              )}
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
