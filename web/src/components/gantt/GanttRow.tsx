import { useMemo } from 'react';
import Avatar from '../Avatar';
import { formatIsoDate } from '../../lib/format';
import { addDaysIso } from '../../lib/workdays';
import { fmtQty, PLAN_STATUS_LABEL, type VelocityPlan } from '../../lib/velocity';
import type { GanttAxis } from '../../lib/ganttAxis';
import type { MemberRoleInfo } from '../../lib/memberRole';
import type { TeamMember, VelocityChart } from '../../types';

interface Props {
  chart: VelocityChart;
  plan: VelocityPlan;
  axis: GanttAxis;
  /** Người tham gia đã tra ra từ roster (uid không còn trong roster thì đã bị lọc). */
  participants: TeamMember[];
  roleOf: (uid: string | null) => MemberRoleInfo | undefined;
  /** Dòng đang xổ panel đồ thị + nhật ký. */
  expanded: boolean;
  onToggle: (chart: VelocityChart) => void;
  onEdit: (chart: VelocityChart) => void;
}

/** Tối đa bao nhiêu avatar xếp chồng trước khi gộp thành "+N". */
const MAX_AVATARS = 5;

/** Đếm nhân sự theo chuyên môn: "🎲 3D Artist ×2". Giữ thứ tự gặp lần đầu. */
function roleCounts(participants: TeamMember[], roleOf: Props['roleOf']) {
  const counts = new Map<string, { icon: string; label: string; n: number }>();
  for (const m of participants) {
    const r = roleOf(m.uid);
    const key = r?.key ?? '__none__';
    const cur = counts.get(key);
    if (cur) cur.n += 1;
    else counts.set(key, { icon: r?.icon ?? '👤', label: r?.label ?? 'Chưa rõ', n: 1 });
  }
  return [...counts.values()];
}

/**
 * Một dòng Gantt = một chart tốc độ: cột trái là tên + người, giữa là bar trên trục chung
 * (phần đã làm tô đậm, vạch "đáng ra tới hôm nay" để thấy ngay nhanh/chậm), phải là số.
 * Bấm dòng để xổ đồ thị burn-up + nhật ký; nút ✏️ mở form sửa thông số.
 */
export default function GanttRow({ chart, plan, axis, participants, roleOf, expanded, onToggle, onEdit }: Props) {
  const roles = useMemo(() => roleCounts(participants, roleOf), [participants, roleOf]);

  // Bar phủ trọn ngày cuối: mốc kết thúc = đầu ngày kế tiếp.
  const left = axis.pct(chart.startDate);
  const width = Math.max(0.6, axis.pct(addDaysIso(chart.endDate, 1)) - left);
  const aimPct = chart.targetDate ? axis.pct(addDaysIso(chart.targetDate, 1)) : null;
  const pctDone = Math.round(plan.pctDone * 100);
  const shownAvatars = participants.slice(0, MAX_AVATARS);
  const extra = participants.length - shownAvatars.length;

  return (
    <div
      className={`gantt-row glass gantt-st-${plan.status}${expanded ? ' open' : ''}`}
      onClick={() => onToggle(chart)}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onKeyDown={(e) => e.key === 'Enter' && onToggle(chart)}
    >
      <div className="gantt-info">
        <div className="gantt-name">
          <span className="gantt-caret" aria-hidden>▸</span>
          {chart.name}
        </div>
        <div className="gantt-dates mono muted">
          {formatIsoDate(chart.startDate)} → {formatIsoDate(chart.endDate)}
          {chart.targetDate && ` · mốc ${formatIsoDate(chart.targetDate).slice(0, 5)}`}
          {' · '}{plan.totalWorkdays} ngày công
        </div>
        <div className="gantt-people">
          {participants.length === 0 ? (
            <span className="muted" style={{ fontSize: '0.78rem' }}>Chưa chọn thành viên</span>
          ) : (
            <>
              <span className="gantt-avatars">
                {shownAvatars.map((m) => (
                  <span key={m.uid} className="gantt-avatar" title={m.displayName}>
                    <Avatar name={m.displayName} photoURL={m.photoURL} size="sm" />
                  </span>
                ))}
                {extra > 0 && <span className="gantt-avatar-more mono">+{extra}</span>}
              </span>
              <span className="gantt-roles">
                {roles.map((r) => (
                  <span key={r.label} className="gantt-role-chip" title={r.label}>
                    <span aria-hidden>{r.icon}</span> {r.label} <b className="mono">×{r.n}</b>
                  </span>
                ))}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="gantt-track">
        {axis.months.map((m) => (
          <span key={m.label} className="gantt-month-line" style={{ left: `${m.leftPct}%` }} aria-hidden />
        ))}
        <div
          className="gantt-bar"
          style={{ left: `${left}%`, width: `${width}%` }}
          title={`${fmtQty(chart.doneQty)}/${fmtQty(chart.totalQty)} ${chart.unit} (${pctDone}%)`}
        >
          <div className="gantt-bar-done" style={{ width: `${plan.pctDone * 100}%` }} />
          {plan.status !== 'not_started' && plan.status !== 'done' && (
            <div
              className="gantt-bar-expect"
              style={{ left: `${plan.pctExpected * 100}%` }}
              title={`Theo kế hoạch tới hôm nay đáng ra xong ${fmtQty(plan.expectedDoneQty)} ${chart.unit}`}
            />
          )}
          <span className="gantt-bar-label mono">{pctDone}%</span>
        </div>
        {aimPct !== null && (
          <div className="gantt-aim" style={{ left: `${aimPct}%` }} title={`Mốc cần xong ${formatIsoDate(chart.targetDate as string)}`} aria-hidden />
        )}
        {axis.todayPct !== null && (
          <div className="gantt-today" style={{ left: `${axis.todayPct}%` }} aria-hidden />
        )}
      </div>

      <div className="gantt-metrics">
        <div className="gantt-qty">
          <b className="mono">{fmtQty(chart.doneQty)}</b>
          <span className="muted">/{fmtQty(chart.totalQty)} {chart.unit}</span>
        </div>
        <div className="gantt-speed">
          <span title="Tốc độ hiện tại (nhập tay, hoặc đo từ đã làm ÷ ngày công đã qua)">
            Hiện tại <b className="mono">{fmtQty(plan.currentVelocity)}</b>/ngày
          </span>
          <span title={`Mỗi ngày công từ mai phải làm bao nhiêu để kịp ${formatIsoDate(plan.aimDate)}`}>
            Cần <b className="mono">{plan.requiredPerDay === null ? '∞' : fmtQty(plan.requiredPerDay)}</b>/ngày
          </span>
        </div>
        <div className="gantt-foot">
          <span className={`badge gantt-badge gantt-badge-${plan.status}`}>{PLAN_STATUS_LABEL[plan.status]}</span>
          {plan.projectedFinish && plan.status !== 'done' && (
            <span className="muted" style={{ fontSize: '0.76rem' }}>
              Dự kiến xong {formatIsoDate(plan.projectedFinish)}
            </span>
          )}
          {plan.status !== 'done' && plan.status !== 'not_started' && (
            <span className="muted mono" style={{ fontSize: '0.76rem' }} title={`Ngày công từ mai tới ${formatIsoDate(plan.aimDate)}`}>
              còn {plan.remainingWorkdays} ngày công
            </span>
          )}
          <button
            type="button"
            className="btn-sm gantt-edit"
            onClick={(e) => { e.stopPropagation(); onEdit(chart); }}
            title="Sửa thông số chart (ngày, khối lượng, người tham gia)"
          >
            ✏️ Sửa
          </button>
        </div>
      </div>
    </div>
  );
}
