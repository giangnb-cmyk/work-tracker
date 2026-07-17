import type { FeatureRow } from '../../lib/timelineRows';

const DAY = 86_400_000;
const OTHER_COLOR = '#64748b'; // hàng "Khác" — task chưa gắn feature

/** Phép chiếu mốc thời gian -> % chiều ngang. Cha tính một lần rồi truyền xuống. */
export interface TimelineScale {
  pct: (ms: number) => number;
  clampPct: (v: number) => number;
  todayPct: number;
  label: (ms: number) => string;
}

interface Props {
  row: FeatureRow;
  /** Bấm hàng -> mở popup danh sách task (không xổ tại chỗ). */
  onOpen: () => void;
  scale: TimelineScale;
}

/** Một hàng feature trong Timeline. Bấm vào để xem danh sách task trong popup. */
export default function TimelineFeatureRow({ row, onOpen, scale }: Props) {
  const { pct, clampPct, todayPct, label } = scale;
  const f = row.feature;
  const color = f?.color ?? OTHER_COLOR;
  const ongoing = f?.kind === 'ongoing';
  const donePct = row.total === 0 ? 0 : Math.round((row.done / row.total) * 100);
  const left = clampPct(pct(row.start));
  const right = clampPct(pct(row.end + DAY));

  return (
    <div className="tl-row tl-feat" onClick={onOpen} title="Xem danh sách task">
      <div className="tl-row-label">
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
  );
}
