import { STATUS_LABEL, type Task, type TaskStatus } from '../../types';
import type { FeatureRow } from '../../lib/timelineRows';

const DAY = 86_400_000;
const OTHER_COLOR = '#64748b'; // hàng "Khác" — task chưa gắn feature

const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: '#94a3b8',
  in_progress: '#38bdf8',
  review: '#c084fc',
  done: '#22c55e',
};

/** Phép chiếu mốc thời gian -> % chiều ngang. Cha tính một lần rồi truyền xuống. */
export interface TimelineScale {
  pct: (ms: number) => number;
  clampPct: (v: number) => number;
  todayPct: number;
  label: (ms: number) => string;
}

interface Props {
  row: FeatureRow;
  open: boolean;
  onToggle: () => void;
  onOpenTask: (t: Task) => void;
  scale: TimelineScale;
}

/** Hàng feature trong Timeline + các hàng task con khi xổ ra. */
export default function TimelineFeatureRow({ row, open, onToggle, onOpenTask, scale }: Props) {
  const { pct, clampPct, todayPct, label } = scale;
  const f = row.feature;
  const color = f?.color ?? OTHER_COLOR;
  const ongoing = f?.kind === 'ongoing';
  const donePct = row.total === 0 ? 0 : Math.round((row.done / row.total) * 100);
  const left = clampPct(pct(row.start));
  const right = clampPct(pct(row.end + DAY));

  return (
    <div>
      <div className="tl-row tl-feat" onClick={onToggle}>
        <div className="tl-row-label" title={f?.name ?? 'Task chưa gắn feature'}>
          <span className={`tl-caret${open ? ' open' : ''}`} aria-hidden>▸</span>
          <span className="tl-name">
            {f ? `${f.icon} ${f.name}` : '📦 Khác'}{ongoing ? ' 🔁' : ''}
          </span>
          <span className="muted tl-who mono">
            {ongoing ? `${row.total - row.done} mở` : `${row.done}/${row.total}`}
          </span>
        </div>
        <div className="tl-track">
          {todayPct >= 0 && todayPct <= 100 && (
            <span className="tl-today faint" style={{ left: `${todayPct}%` }} />
          )}
          {row.hasDates ? (
            <span
              className="tl-bar tl-feat-bar"
              title={
                ongoing
                  ? `Liên tục · ${row.total} task · ${label(row.start)} → ${label(row.end)}`
                  : `${label(row.start)} → ${label(row.end)} · ${donePct}% xong`
              }
              style={{
                left: `${left}%`,
                width: `${Math.max(1.5, right - left)}%`,
                // ongoing: sọc chéo "chạy mãi", không có fill %; delivery: nền nhạt +
                // fill đặc theo % task xong.
                background: ongoing
                  ? `repeating-linear-gradient(45deg, ${color}66 0 8px, ${color}22 8px 16px)`
                  : `${color}33`,
              }}
            >
              {!ongoing && (
                <span className="tl-feat-fill" style={{ width: `${donePct}%`, background: color }} />
              )}
            </span>
          ) : (
            <span className="tl-nodate muted">chưa có hạn</span>
          )}
        </div>
      </div>

      {open && row.bars.map((b) => {
        const tLeft = clampPct(pct(b.start));
        const tRight = clampPct(pct(b.end + DAY));
        return (
          <div className="tl-row tl-sub" key={b.task.id} onClick={() => onOpenTask(b.task)}>
            <div className="tl-row-label" title={b.task.title}>
              <span className="tl-dot" style={{ background: STATUS_COLOR[b.task.status] }} />
              <span className="tl-name">{b.task.title}</span>
              <span className="muted tl-who">{b.task.assigneeName || '—'}</span>
              {/* Cả hàng vẫn bấm được, nhưng nút hiện rõ mới là thứ người ta tìm —
                  một hàng gantt không tự nói được là bấm vào thì có gì. */}
              <button
                type="button"
                className="tl-jump"
                title="Mở chi tiết task"
                onClick={(e) => { e.stopPropagation(); onOpenTask(b.task); }}
              >
                Go ↗
              </button>
            </div>
            <div className="tl-track">
              {todayPct >= 0 && todayPct <= 100 && (
                <span className="tl-today faint" style={{ left: `${todayPct}%` }} />
              )}
              {b.hasDates ? (
                <span
                  className="tl-bar"
                  title={`${STATUS_LABEL[b.task.status]} · ${label(b.start)} → ${label(b.end)}`}
                  style={{
                    left: `${tLeft}%`,
                    width: `${Math.max(1.5, tRight - tLeft)}%`,
                    background: STATUS_COLOR[b.task.status],
                  }}
                />
              ) : (
                <span className="tl-nodate muted">chưa có hạn</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
