import { useMemo, useState } from 'react';
import { useSprintContext } from '../contexts/SprintContext';
import { useProjectTasks } from '../hooks/useProjectTasks';
import DateRangePicker from './DateRangePicker';
import TaskModal from './TaskModal';
import { TIMELINE_PRESETS, startOfDay, type DateRange } from '../lib/dateRange';
import { STATUS_LABEL, type Feature, type Task, type TaskStatus } from '../types';

const DAY = 86_400_000;
const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: '#94a3b8',
  in_progress: '#38bdf8',
  review: '#c084fc',
  done: '#22c55e',
};
const OTHER_COLOR = '#64748b'; // hàng "Khác" — task chưa gắn feature

function label(ms: number): string {
  return new Date(ms).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

interface TaskBar {
  task: Task;
  start: number;
  end: number;
  hasDates: boolean;
}

interface FeatureRow {
  feature: Feature | null; // null = "Khác"
  /** Task trong khoảng đang xem — có hạn trước (theo ngày bắt đầu), chưa hạn sau. */
  bars: TaskBar[];
  start: number;
  end: number;
  hasDates: boolean;
  done: number;
  total: number;
}

/**
 * Timeline CẢ DỰ ÁN, gộp theo feature: mỗi hàng một feature, bar phủ từ task sớm nhất
 * tới hạn muộn nhất, fill = % task xong. Bấm hàng để xổ task bên trong. Khoảng thời
 * gian chọn bằng DateRangePicker (cùng bộ với tab Truy cập, nhưng cho phép tương lai).
 */
export default function Timeline() {
  const { selectedProjectId, selectedProject, features } = useSprintContext();
  const { tasks, loading } = useProjectTasks(selectedProjectId);
  // null = "cả dự án": khung tự co giãn theo min→max hạn của toàn bộ task.
  const [range, setRange] = useState<DateRange | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);

  const taskBars: TaskBar[] = useMemo(
    () =>
      tasks.map((t) => {
        const s = t.dueStart?.toMillis() ?? t.dueDate?.toMillis() ?? 0;
        const e = t.dueDate?.toMillis() ?? t.dueStart?.toMillis() ?? 0;
        return { task: t, start: startOfDay(s || e), end: startOfDay(e || s), hasDates: Boolean(s || e) };
      }),
    [tasks],
  );

  // Khung "cả dự án": min→max các task có hạn, luôn chứa hôm nay.
  const projectDomain = useMemo(() => {
    const dated = taskBars.filter((b) => b.hasDates);
    const now = startOfDay(Date.now());
    if (dated.length === 0) return { start: now - DAY, end: now + 30 * DAY };
    let min = Math.min(...dated.map((b) => b.start));
    let max = Math.max(...dated.map((b) => b.end));
    min = Math.min(min, now);
    max = Math.max(max, now);
    return { start: min - DAY, end: max + DAY };
  }, [taskBars]);

  const domain = useMemo(
    () => (range ? { start: startOfDay(range.fromMs), end: startOfDay(range.toMs) } : projectDomain),
    [range, projectDomain],
  );

  // Gộp theo feature. Task có hạn phải GIAO với khoảng đang xem; task chưa hạn luôn
  // được giữ (không vẽ được bar nhưng vẫn tính vào tổng của feature).
  const rows: FeatureRow[] = useMemo(() => {
    const byFeature = new Map<string, TaskBar[]>();
    for (const b of taskBars) {
      if (b.hasDates && (b.start > domain.end || b.end < domain.start)) continue;
      const key = b.task.featureId ?? 'other';
      let arr = byFeature.get(key);
      if (!arr) {
        arr = [];
        byFeature.set(key, arr);
      }
      arr.push(b);
    }
    const make = (feature: Feature | null, bars: TaskBar[]): FeatureRow => {
      const sorted = [...bars].sort(
        (a, b) => Number(b.hasDates) - Number(a.hasDates) || a.start - b.start,
      );
      const dated = sorted.filter((b) => b.hasDates);
      return {
        feature,
        bars: sorted,
        start: dated.length ? Math.min(...dated.map((b) => b.start)) : 0,
        end: dated.length ? Math.max(...dated.map((b) => b.end)) : 0,
        hasDates: dated.length > 0,
        done: sorted.filter((b) => b.task.status === 'done').length,
        total: sorted.length,
      };
    };
    const out: FeatureRow[] = [];
    for (const f of features) {
      if (f.projectId !== selectedProjectId) continue;
      const bars = byFeature.get(f.id);
      if (bars?.length) out.push(make(f, bars));
    }
    const other = byFeature.get('other');
    if (other?.length) out.push(make(null, other));
    // "Khác" xuống cuối; còn lại: có hạn trước, rồi theo ngày bắt đầu.
    return out.sort(
      (a, b) =>
        Number(a.feature === null) - Number(b.feature === null) ||
        Number(b.hasDates) - Number(a.hasDates) ||
        a.start - b.start,
    );
  }, [taskBars, features, selectedProjectId, domain]);

  const span = Math.max(DAY, domain.end - domain.start);
  const totalDays = Math.round(span / DAY);
  const step = totalDays > 180 ? 30 : totalDays > 90 ? 14 : totalDays > 30 ? 7 : totalDays > 14 ? 2 : 1;

  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = domain.start; t <= domain.end; t += step * DAY) out.push(t);
    return out;
  }, [domain, step]);

  const pct = (ms: number) => ((ms - domain.start) / span) * 100;
  const clampPct = (v: number) => Math.max(0, Math.min(100, v));
  const todayPct = pct(startOfDay(Date.now()));

  if (!selectedProjectId) {
    return <div className="glass empty">Hãy chọn một dự án trước.</div>;
  }
  if (loading) {
    return <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>;
  }

  const pickerValue: DateRange = range ?? { fromMs: domain.start, toMs: domain.end, presetId: null };

  return (
    <div className="fade-in">
      <div className="view-header row between">
        <div>
          <h1>Timeline · {selectedProject?.name ?? 'Dự án'}</h1>
          <p>Cả dự án, gộp theo feature — bấm một hàng để xem task bên trong.</p>
        </div>
        <div className="row" style={{ gap: '0.5rem' }}>
          {range && (
            <button className="btn-sm" onClick={() => setRange(null)}>Cả dự án</button>
          )}
          <DateRangePicker value={pickerValue} onChange={setRange} presets={TIMELINE_PRESETS} allowFuture />
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="glass empty">Chưa có task.</div>
      ) : rows.length === 0 ? (
        <div className="glass empty">Không có task nào trong khoảng này.</div>
      ) : (
        <div className="glass tl-wrap">
          <div className="tl-scroll">
            {/* Axis */}
            <div className="tl-axis">
              <div className="tl-row-label tl-axis-label muted">Feature</div>
              <div className="tl-track tl-axis-track">
                {ticks.map((t) => (
                  <span key={t} className="tl-tick" style={{ left: `${pct(t)}%` }}>{label(t)}</span>
                ))}
                {todayPct >= 0 && todayPct <= 100 && (
                  <span className="tl-today" style={{ left: `${todayPct}%` }} title="Hôm nay" />
                )}
              </div>
            </div>

            {/* Feature rows */}
            {rows.map((row) => {
              const f = row.feature;
              const id = f?.id ?? 'other';
              const color = f?.color ?? OTHER_COLOR;
              const ongoing = f?.kind === 'ongoing';
              const open = expandedId === id;
              const donePct = row.total === 0 ? 0 : Math.round((row.done / row.total) * 100);
              const left = clampPct(pct(row.start));
              const right = clampPct(pct(row.end + DAY));
              return (
                <div key={id}>
                  <div className="tl-row tl-feat" onClick={() => setExpandedId(open ? null : id)}>
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
                            // ongoing: sọc chéo "chạy mãi", không có fill %; delivery: nền
                            // nhạt + fill đặc theo % task xong.
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

                  {/* Task con khi xổ ra */}
                  {open && row.bars.map((b) => {
                    const tLeft = clampPct(pct(b.start));
                    const tRight = clampPct(pct(b.end + DAY));
                    return (
                      <div className="tl-row tl-sub" key={b.task.id} onClick={() => setEditing(b.task)}>
                        <div className="tl-row-label" title={b.task.title}>
                          <span className="tl-dot" style={{ background: STATUS_COLOR[b.task.status] }} />
                          <span className="tl-name">{b.task.title}</span>
                          <span className="muted tl-who">{b.task.assigneeName || '—'}</span>
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
            })}
          </div>
        </div>
      )}

      {editing && (
        <TaskModal task={editing} defaultSprintId={editing.sprintId} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
