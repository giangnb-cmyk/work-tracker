import { useMemo, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog';
import WatchersField from '../task/WatchersField';
import { formatIsoDate, todayIso } from '../../lib/format';
import { computePlan, fmtQty, PLAN_STATUS_LABEL } from '../../lib/velocity';
import { createVelocityChart, deleteVelocityChart, updateVelocityChart } from '../../lib/velocityChartWrites';
import type { MemberRoleInfo } from '../../lib/memberRole';
import type { TeamMember, VelocityChart, VelocityChartInput } from '../../types';

interface Props {
  /** null = tạo mới. */
  chart: VelocityChart | null;
  projectId: string;
  members: TeamMember[];
  roleOf: (uid: string | null) => MemberRoleInfo | undefined;
  holidaySet: ReadonlySet<string>;
  /** uid người đang đăng nhập — gắn vào created_by khi tạo (RLS ép đúng người gọi). */
  currentUid: string;
  /** false = chỉ xem (không phải admin / người tạo / sprint.manage). */
  canEdit: boolean;
  onClose: () => void;
}

/** Chuỗi ô số → number; rỗng/sai → null. Cho phép dấu phẩy kiểu VN ("2,5"). */
function parseNum(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Form tạo/sửa một chart tốc độ. Bên dưới các ô nhập có khung XEM TRƯỚC tính ngay khi gõ:
 * ngày công, cần mỗi ngày bao nhiêu, dự kiến xong — để người lập kế hoạch thử số liệu
 * (đổi deadline, thêm người…) mà không phải Lưu rồi mới thấy.
 */
export default function VelocityChartModal({
  chart,
  projectId,
  members,
  roleOf,
  holidaySet,
  currentUid,
  canEdit,
  onClose,
}: Props) {
  const isEdit = Boolean(chart);
  const [name, setName] = useState(chart?.name ?? '');
  const [unit, setUnit] = useState(chart?.unit ?? 'việc');
  const [startDate, setStartDate] = useState(chart?.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(chart?.endDate ?? '');
  const [totalQty, setTotalQty] = useState(chart ? String(chart.totalQty) : '');
  const [doneQty, setDoneQty] = useState(chart ? String(chart.doneQty) : '0');
  const [velocity, setVelocity] = useState(chart?.velocity === null || chart?.velocity === undefined ? '' : String(chart.velocity));
  const [memberIds, setMemberIds] = useState<string[]>(chart?.memberIds ?? []);
  const [note, setNote] = useState(chart?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const disabled = !canEdit || saving;

  // Xem trước: dựng chart tạm từ form; thiếu ngày/số thì chưa tính.
  const preview = useMemo(() => {
    const total = parseNum(totalQty);
    if (!startDate || !endDate || endDate < startDate || total === null) return null;
    const draft: VelocityChart = {
      id: chart?.id ?? 'draft',
      projectId,
      name,
      unit,
      startDate,
      endDate,
      totalQty: total,
      doneQty: parseNum(doneQty) ?? 0,
      velocity: parseNum(velocity),
      memberIds,
      note,
      sortOrder: 0,
      createdBy: null,
    };
    return computePlan(draft, holidaySet, todayIso());
  }, [chart?.id, projectId, name, unit, startDate, endDate, totalQty, doneQty, velocity, memberIds, note, holidaySet]);

  // Đếm nhân sự theo chuyên môn ngay dưới ô chọn người.
  const roleSummary = useMemo(() => {
    const counts = new Map<string, { icon: string; label: string; n: number }>();
    for (const uid of memberIds) {
      const r = roleOf(uid);
      const key = r?.key ?? '__none__';
      const cur = counts.get(key);
      if (cur) cur.n += 1;
      else counts.set(key, { icon: r?.icon ?? '👤', label: r?.label ?? 'Chưa rõ', n: 1 });
    }
    return [...counts.values()];
  }, [memberIds, roleOf]);

  function validate(): VelocityChartInput | string {
    if (!name.trim()) return 'Cần nhập tên công việc.';
    if (!startDate || !endDate) return 'Cần chọn ngày bắt đầu và kết thúc.';
    if (endDate < startDate) return 'Ngày kết thúc phải sau (hoặc bằng) ngày bắt đầu.';
    const total = parseNum(totalQty);
    if (total === null || total < 0) return 'Khối lượng phải là số ≥ 0.';
    const done = parseNum(doneQty) ?? 0;
    if (done < 0) return 'Đã làm phải là số ≥ 0.';
    const vel = velocity.trim() ? parseNum(velocity) : null;
    if (velocity.trim() && (vel === null || vel < 0)) return 'Tốc độ phải là số ≥ 0, hoặc để trống để tự đo.';
    return {
      name,
      unit: unit.trim() || 'việc',
      startDate,
      endDate,
      totalQty: total,
      doneQty: done,
      velocity: vel,
      memberIds,
      note,
    };
  }

  async function handleSave() {
    const input = validate();
    if (typeof input === 'string') {
      setError(input);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (chart) await updateVelocityChart(chart.id, input);
      else await createVelocityChart(projectId, input, currentUid);
      onClose();
    } catch (err) {
      console.error('Lưu chart tốc độ thất bại', err);
      setError('Lưu thất bại — kiểm tra quyền hoặc kết nối.');
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!chart) return;
    try {
      await deleteVelocityChart(chart.id);
      onClose();
    } catch (err) {
      console.error('Xoá chart tốc độ thất bại', err);
      setConfirmDelete(false);
      setError('Xoá thất bại — cần quyền admin hoặc là người tạo chart.');
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? 'Sửa chart tốc độ' : 'Chart tốc độ mới'}</h2>
        {!canEdit && (
          <p className="perf-hint">Chỉ xem — admin, người tạo chart hoặc người có quyền Quản lý sprint mới sửa được.</p>
        )}

        <div className="grid-2">
          <label className="field">
            <span>Tên công việc *</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Model 3D map 1" disabled={disabled} autoFocus />
          </label>
          <label className="field">
            <span>Đơn vị khối lượng</span>
            <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="model, map, màn…" disabled={disabled} maxLength={30} />
          </label>
        </div>

        <div className="grid-2">
          <label className="field">
            <span>Bắt đầu *</span>
            <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={disabled} />
          </label>
          <label className="field">
            <span>Deadline *</span>
            <input className="input" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} disabled={disabled} />
          </label>
        </div>

        <div className="grid-3">
          <label className="field">
            <span>Khối lượng tổng *</span>
            <input className="input" inputMode="decimal" value={totalQty} onChange={(e) => setTotalQty(e.target.value)} placeholder="120" disabled={disabled} />
          </label>
          <label className="field">
            <span>Đã làm được</span>
            <input className="input" inputMode="decimal" value={doneQty} onChange={(e) => setDoneQty(e.target.value)} placeholder="0" disabled={disabled} />
          </label>
          <label className="field">
            <span>Tốc độ hiện tại ({unit.trim() || 'việc'}/ngày công)</span>
            <input
              className="input"
              inputMode="decimal"
              value={velocity}
              onChange={(e) => setVelocity(e.target.value)}
              placeholder={preview?.measuredVelocity !== null && preview?.measuredVelocity !== undefined ? `Tự đo: ${fmtQty(preview.measuredVelocity)}` : 'Để trống = tự đo'}
              disabled={disabled}
            />
          </label>
        </div>
        <p className="muted" style={{ fontSize: '0.78rem', marginTop: '-0.35rem', marginBottom: '0.85rem' }}>
          💡 Để trống tốc độ thì hệ thống tự đo = đã làm ÷ số ngày công đã qua. Điền tay khi
          muốn "giả sử đội chạy X/ngày" để xem kịp không.
        </p>

        {/* Khung xem trước — tính ngay khi gõ, trước khi Lưu. */}
        <div className="gantt-preview glass">
          {preview ? (
            <>
              <div className="gantt-preview-row">
                <span>Ngày công</span>
                <b className="mono">{preview.totalWorkdays}</b>
                <span className="muted">(đã qua {preview.elapsedWorkdays} · còn {preview.remainingWorkdays}) — bỏ T7/CN & ngày lễ</span>
              </div>
              <div className="gantt-preview-row">
                <span>Nhịp kế hoạch</span>
                <b className="mono">{fmtQty(preview.plannedPerDay)}</b>
                <span className="muted">{unit}/ngày công cho cả kỳ</span>
              </div>
              <div className="gantt-preview-row gantt-preview-key">
                <span>Cần từ giờ</span>
                <b className="mono">{preview.requiredPerDay === null ? '∞' : fmtQty(preview.requiredPerDay)}</b>
                <span className="muted">{unit}/ngày công để kịp deadline (còn {fmtQty(preview.remainingQty)} {unit})</span>
              </div>
              <div className="gantt-preview-row">
                <span>Tốc độ hiện tại</span>
                <b className="mono">{fmtQty(preview.currentVelocity)}</b>
                <span className="muted">
                  {unit}/ngày
                  {preview.projectedFinish && preview.status !== 'done' ? ` → dự kiến xong ${formatIsoDate(preview.projectedFinish)}` : ''}
                </span>
              </div>
              <div className="gantt-preview-row">
                <span>Đánh giá</span>
                <span className={`badge gantt-badge gantt-badge-${preview.status}`}>{PLAN_STATUS_LABEL[preview.status]}</span>
              </div>
            </>
          ) : (
            <span className="muted" style={{ fontSize: '0.82rem' }}>Điền ngày bắt đầu, deadline và khối lượng để xem tính toán.</span>
          )}
        </div>

        <WatchersField
          members={members}
          watcherIds={memberIds}
          onChange={setMemberIds}
          disabled={disabled}
          label="Thành viên tham gia"
        />
        {roleSummary.length > 0 && (
          <p className="gantt-roles" style={{ marginTop: '-0.4rem', marginBottom: '0.85rem' }}>
            <span className="muted" style={{ fontSize: '0.78rem' }}>{memberIds.length} người:</span>
            {roleSummary.map((r) => (
              <span key={r.label} className="gantt-role-chip">
                <span aria-hidden>{r.icon}</span> {r.label} <b className="mono">×{r.n}</b>
              </span>
            ))}
          </p>
        )}

        <label className="field">
          <span>Ghi chú</span>
          <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} disabled={disabled} rows={2} />
        </label>

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          {isEdit && canEdit && (
            <button className="btn-sm btn-danger" onClick={() => setConfirmDelete(true)} disabled={saving} style={{ marginRight: 'auto' }}>
              Xoá chart
            </button>
          )}
          <button className="btn-sm" onClick={onClose} disabled={saving}>{canEdit ? 'Huỷ' : 'Đóng'}</button>
          {canEdit && (
            <button className="btn-primary" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Đang lưu…' : isEdit ? 'Lưu' : 'Tạo'}
            </button>
          )}
        </div>
      </div>

      {confirmDelete && chart && (
        <ConfirmDialog
          title="Xoá chart tốc độ?"
          message={<>Xoá chart <strong>“{chart.name}”</strong> khỏi tab Gantt.</>}
          detail="Không hoàn tác được. Task/feature của dự án không bị ảnh hưởng — chart chỉ là bảng theo dõi riêng."
          confirmLabel="Xoá chart"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
