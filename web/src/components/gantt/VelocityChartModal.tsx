import { useMemo, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog';
import SearchableSelect from '../SearchableSelect';
import WatchersField from '../task/WatchersField';
import TaskPickField from './TaskPickField';
import { formatIsoDate, todayIso } from '../../lib/format';
import { computePlan, fmtQty, PLAN_STATUS_LABEL } from '../../lib/velocity';
import { applyLink, deriveLinked, isLinked } from '../../lib/velocityLink';
import { createVelocityChart, deleteVelocityChart, updateVelocityChart } from '../../lib/velocityChartWrites';
import { setProgressTotal } from '../../lib/velocityProgressWrites';
import type { MemberRoleInfo } from '../../lib/memberRole';
import type {
  Feature,
  Task,
  TeamMember,
  VelocityChart,
  VelocityChartInput,
  VelocityCountBy,
  VelocityLinkKind,
} from '../../types';

interface Props {
  /** null = tạo mới. */
  chart: VelocityChart | null;
  projectId: string;
  members: TeamMember[];
  roleOf: (uid: string | null) => MemberRoleInfo | undefined;
  holidaySet: ReadonlySet<string>;
  /** Feature + task của dự án — để link nguồn tiến độ và xem trước số dẫn xuất. */
  features: Feature[];
  tasks: Task[];
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

const LINK_KINDS: { id: VelocityLinkKind; label: string }[] = [
  { id: 'manual', label: 'Nhập tay' },
  { id: 'feature', label: 'Theo feature' },
  { id: 'tasks', label: 'Chọn task' },
];

/**
 * Form tạo/sửa một chart tốc độ. Khung XEM TRƯỚC tính ngay khi gõ để thử số liệu (đổi mốc,
 * thêm người…) mà không phải Lưu. Nguồn tiến độ: nhập tay (+ nhật ký), hoặc LINK task
 * (0087) — khi link, "đã xong" và đường thật lấy từ task done, không có ô nhập.
 */
export default function VelocityChartModal({
  chart,
  projectId,
  members,
  roleOf,
  holidaySet,
  features,
  tasks,
  currentUid,
  canEdit,
  onClose,
}: Props) {
  const isEdit = Boolean(chart);
  const [name, setName] = useState(chart?.name ?? '');
  const [unit, setUnit] = useState(chart?.unit ?? 'việc');
  const [startDate, setStartDate] = useState(chart?.startDate ?? todayIso());
  const [targetDate, setTargetDate] = useState(chart?.targetDate ?? '');
  const [endDate, setEndDate] = useState(chart?.endDate ?? '');
  const [totalQty, setTotalQty] = useState(chart && chart.totalQty > 0 ? String(chart.totalQty) : '');
  const [doneQty, setDoneQty] = useState(chart ? String(chart.doneQty) : '0');
  const [velocity, setVelocity] = useState(chart?.velocity === null || chart?.velocity === undefined ? '' : String(chart.velocity));
  const [memberIds, setMemberIds] = useState<string[]>(chart?.memberIds ?? []);
  const [note, setNote] = useState(chart?.note ?? '');
  const [linkKind, setLinkKind] = useState<VelocityLinkKind>(chart?.linkKind ?? 'manual');
  const [featureId, setFeatureId] = useState<string>(chart?.featureId ?? '');
  const [taskIds, setTaskIds] = useState<string[]>(chart?.taskIds ?? []);
  const [countBy, setCountBy] = useState<VelocityCountBy>(chart?.countBy ?? 'tasks');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const disabled = !canEdit || saving;
  // Chart nhập tay nhưng có task gắn từ chi tiết task → vẫn chạy theo task (xem isLinked).
  const attachedCount = chart ? tasks.filter((t) => t.chartId === chart.id).length : 0;
  const linked = linkKind !== 'manual' || attachedCount > 0;
  const unitLabel = linked && countBy === 'points' ? 'điểm' : linked && !unit.trim() ? 'task' : unit.trim() || 'việc';
  const today = todayIso();

  // Bản nháp từ form — dùng cho cả xem trước lẫn lưu. Thiếu ngày/số thì null.
  const draft = useMemo<VelocityChart | null>(() => {
    const total = parseNum(totalQty) ?? 0;
    if (!startDate || !endDate || endDate < startDate) return null;
    if (targetDate && (targetDate < startDate || targetDate > endDate)) return null;
    return {
      id: chart?.id ?? 'draft',
      projectId,
      name,
      unit: unitLabel,
      startDate,
      endDate,
      targetDate: targetDate || null,
      totalQty: total,
      doneQty: parseNum(doneQty) ?? 0,
      velocity: parseNum(velocity),
      memberIds,
      note,
      linkKind,
      featureId: featureId || null,
      taskIds,
      countBy,
      sortOrder: 0,
      createdBy: null,
    };
  }, [chart?.id, projectId, name, unitLabel, startDate, targetDate, endDate, totalQty, doneQty, velocity, memberIds, note, linkKind, featureId, taskIds, countBy]);

  const linkedInfo = useMemo(() => (draft && isLinked(draft, tasks) ? deriveLinked(draft, tasks, today) : null), [draft, tasks, today]);
  const preview = useMemo(() => (draft ? computePlan(applyLink(draft, tasks, today), holidaySet, today) : null), [draft, tasks, today, holidaySet]);

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
    if (!startDate || !endDate) return 'Cần chọn ngày bắt đầu và deadline.';
    if (endDate < startDate) return 'Deadline phải sau (hoặc bằng) ngày bắt đầu.';
    if (targetDate && (targetDate < startDate || targetDate > endDate)) return 'Mốc cần xong phải nằm giữa ngày bắt đầu và deadline.';
    if (linkKind === 'feature' && !featureId) return 'Chọn feature để lấy tiến độ.';
    if (linkKind === 'tasks' && taskIds.length === 0) return 'Chọn ít nhất một task.';
    const total = parseNum(totalQty) ?? 0;
    if (total < 0) return 'Khối lượng phải là số ≥ 0.';
    if (!linked && total <= 0) return 'Khối lượng tổng phải > 0.';
    const done = linked ? (linkedInfo?.doneQty ?? 0) : parseNum(doneQty) ?? 0;
    if (done < 0) return 'Đã làm phải là số ≥ 0.';
    const vel = velocity.trim() ? parseNum(velocity) : null;
    if (velocity.trim() && (vel === null || vel < 0)) return 'Tốc độ phải là số ≥ 0, hoặc để trống để tự đo.';
    return {
      name,
      unit: unitLabel,
      startDate,
      endDate,
      targetDate: targetDate || null,
      totalQty: total,
      doneQty: done,
      velocity: vel,
      memberIds,
      note,
      linkKind,
      featureId: linkKind === 'feature' ? featureId : null,
      taskIds: linkKind === 'tasks' ? taskIds : [],
      countBy,
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
      let id = chart?.id;
      if (chart) await updateVelocityChart(chart.id, input);
      else id = await createVelocityChart(projectId, input, currentUid);
      // Chart NHẬP TAY: ô "Đã làm" là TỔNG — chỉnh mục hôm nay sao cho tổng nhật ký = số này
      // (nhật ký lưu theo ngày, 0089). Chart LINK không ghi nhật ký — tiến độ là của task.
      const doneChanged = chart ? input.doneQty !== chart.doneQty : input.doneQty > 0;
      if (id && !linked && doneChanged) {
        void setProgressTotal(id, today, input.doneQty, currentUid).catch((err) =>
          console.warn('Ghi nhật ký tiến độ kèm lần lưu thất bại:', err),
        );
      }
      onClose();
    } catch (err) {
      console.error('Lưu chart tốc độ thất bại', err);
      setError('Lưu thất bại. Kiểm tra quyền hoặc kết nối.');
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
      setError('Xoá thất bại. Cần quyền admin hoặc là người tạo chart.');
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? 'Sửa chart tốc độ' : 'Chart tốc độ mới'}</h2>
        {!canEdit && (
          <p className="perf-hint">Chỉ xem. Admin, người tạo chart hoặc người có quyền Quản lý sprint mới sửa được.</p>
        )}

        <div className="grid-2">
          <label className="field">
            <span>Tên công việc *</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Model 3D map 1" disabled={disabled} autoFocus />
          </label>
          <label className="field">
            <span>Đơn vị khối lượng</span>
            <input
              className="input"
              value={linked && countBy === 'points' ? 'điểm' : unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="model, map, màn…"
              disabled={disabled || (linked && countBy === 'points')}
              maxLength={30}
            />
          </label>
        </div>

        <div className="grid-3">
          <label className="field">
            <span>Bắt đầu *</span>
            <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={disabled} />
          </label>
          <label className="field">
            <span>Mốc cần xong (tuỳ chọn)</span>
            <input className="input" type="date" value={targetDate} min={startDate || undefined} max={endDate || undefined} onChange={(e) => setTargetDate(e.target.value)} disabled={disabled} />
          </label>
          <label className="field">
            <span>Deadline *</span>
            <input className="input" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} disabled={disabled} />
          </label>
        </div>
        <p className="muted" style={{ fontSize: '0.78rem', marginTop: '-0.35rem', marginBottom: '0.85rem' }}>
          💡 Mốc cần xong = ngày đội muốn xong (nhịp "cần/ngày" tính tới đây); Deadline = hạn cứng.
          Bỏ trống mốc thì tính tới deadline.
        </p>

        {/* Nguồn tiến độ (0087). */}
        <div className="field" style={{ marginBottom: '0.5rem' }}>
          <span>Nguồn tiến độ</span>
          <div className="row" style={{ gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
            <div className="seg-toggle" role="group" aria-label="Nguồn tiến độ">
              {LINK_KINDS.map((k) => (
                <button key={k.id} type="button" className={`seg${linkKind === k.id ? ' on' : ''}`} onClick={() => setLinkKind(k.id)} disabled={disabled}>
                  {k.label}
                </button>
              ))}
            </div>
            {linked && (
              <div className="seg-toggle" role="group" aria-label="Cách đếm">
                <button type="button" className={`seg${countBy === 'tasks' ? ' on' : ''}`} onClick={() => setCountBy('tasks')} disabled={disabled} title="Mỗi task = 1 đơn vị, hoặc số đơn vị khai trong chi tiết task">Theo đơn vị task</button>
                <button type="button" className={`seg${countBy === 'points' ? ' on' : ''}`} onClick={() => setCountBy('points')} disabled={disabled}>Theo điểm</button>
              </div>
            )}
          </div>
        </div>
        {linkKind === 'feature' && (
          <div className="field">
            <SearchableSelect
              value={featureId}
              onChange={setFeatureId}
              options={features.map((f) => ({ value: f.id, label: `${f.icon} ${f.name}` }))}
              placeholder="Chọn feature…"
              disabled={disabled}
            />
          </div>
        )}
        {linkKind === 'tasks' && (
          <div className="field">
            <TaskPickField
              tasks={tasks}
              selectedIds={taskIds}
              onChange={setTaskIds}
              lockedIds={chart ? tasks.filter((t) => t.chartId === chart.id).map((t) => t.id) : []}
              disabled={disabled}
            />
          </div>
        )}
        <p className="muted" style={{ fontSize: '0.78rem', marginTop: '-0.35rem', marginBottom: '0.85rem' }}>
          {linked
            ? <>🔗 Đã xong lấy từ task Hoàn thành trong phạm vi; đường tiến độ thật dựng từ ngày tick xong.
              {linkKind === 'manual'
                ? <> Chart này có <b>{attachedCount}</b> task gắn từ chi tiết task nên chạy theo task; nhật ký tay không dùng nữa.</>
                : <> Task cũng gắn được vào chart này từ chi tiết task, kèm số {unitLabel} riêng của nó.</>}
              {linkedInfo && <> Hiện có <b>{linkedInfo.scope.length}</b> task, xong <b>{linkedInfo.doneTasks.length}</b>.</>}</>
            : <>✍️ "Đã làm" là tổng hiện tại; đổi ở đây = chỉnh mục hôm nay trong nhật ký để tổng bằng số này.
              Gắn task vào chart này từ chi tiết task thì chart chuyển sang chạy theo task.</>}
        </p>

        <div className="grid-3">
          <label className="field">
            <span>{linked ? 'Khối lượng kế hoạch (0 = theo số task)' : 'Khối lượng tổng *'}</span>
            <input className="input" inputMode="decimal" value={totalQty} onChange={(e) => setTotalQty(e.target.value)} placeholder={linked && linkedInfo ? `Theo phạm vi: ${fmtQty(linkedInfo.totalQty)}` : '120'} disabled={disabled} />
          </label>
          <label className="field">
            <span>Đã làm được</span>
            <input
              className="input"
              inputMode="decimal"
              value={linked ? (linkedInfo ? String(linkedInfo.doneQty) : '') : doneQty}
              onChange={(e) => setDoneQty(e.target.value)}
              placeholder="0"
              disabled={disabled || linked}
              title={linked ? 'Tự tính từ task đã hoàn thành' : undefined}
            />
          </label>
          <label className="field">
            <span>Tốc độ hiện tại ({unitLabel}/ngày công)</span>
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

        <div className="gantt-preview glass">
          {preview ? (
            <>
              <div className="gantt-preview-row">
                <span>Ngày công</span>
                <b className="mono">{preview.totalWorkdays}</b>
                <span className="muted">
                  tới {formatIsoDate(preview.aimDate)} (đã qua {preview.elapsedWorkdays}, còn {preview.remainingWorkdays}
                  {targetDate ? `, tới deadline còn ${preview.workdaysToDeadline}` : ''}), bỏ T7/CN và ngày lễ
                </span>
              </div>
              <div className="gantt-preview-row">
                <span>Nhịp kế hoạch</span>
                <b className="mono">{fmtQty(preview.plannedPerDay)}</b>
                <span className="muted">{unitLabel}/ngày công cho cả kỳ</span>
              </div>
              <div className="gantt-preview-row gantt-preview-key">
                <span>Cần từ mai</span>
                <b className="mono">{preview.requiredPerDay === null ? '∞' : fmtQty(preview.requiredPerDay)}</b>
                <span className="muted">{unitLabel}/ngày công để kịp mốc (còn {fmtQty(preview.remainingQty)} {unitLabel})</span>
              </div>
              <div className="gantt-preview-row">
                <span>Tốc độ hiện tại</span>
                <b className="mono">{fmtQty(preview.currentVelocity)}</b>
                <span className="muted">
                  {unitLabel}/ngày
                  {preview.projectedFinish && preview.status !== 'done' ? ` → dự kiến xong ${formatIsoDate(preview.projectedFinish)}` : ''}
                </span>
              </div>
              <div className="gantt-preview-row">
                <span>Đánh giá</span>
                <span className={`badge gantt-badge gantt-badge-${preview.status}`}>{PLAN_STATUS_LABEL[preview.status]}</span>
              </div>
            </>
          ) : (
            <span className="muted" style={{ fontSize: '0.82rem' }}>Điền ngày bắt đầu, deadline (mốc nếu có phải nằm giữa) để xem tính toán.</span>
          )}
        </div>

        <WatchersField members={members} watcherIds={memberIds} onChange={setMemberIds} disabled={disabled} label="Thành viên tham gia" />
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
          detail="Không hoàn tác được. Nhật ký tiến độ của chart cũng mất theo. Task/feature của dự án không bị ảnh hưởng."
          confirmLabel="Xoá chart"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
