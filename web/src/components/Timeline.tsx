import { useMemo, useState } from 'react';
import { useSprintContext } from '../contexts/SprintContext';
import { useTasks } from '../hooks/useTasks';
import TaskModal from './TaskModal';
import { STATUS_LABEL, type Task, type TaskStatus } from '../types';

const DAY = 86_400_000;
const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: '#94a3b8',
  in_progress: '#38bdf8',
  review: '#c084fc',
  done: '#22c55e',
};

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function label(ms: number): string {
  return new Date(ms).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

interface Bar {
  task: Task;
  start: number;
  end: number;
  hasDates: boolean;
}

/** Sprint timeline (mini Gantt): one bar per task across its dueStart→dueDate window. */
export default function Timeline() {
  const { selectedSprint, selectedSprintId } = useSprintContext();
  const { tasks, loading } = useTasks(selectedSprintId);
  const [editing, setEditing] = useState<Task | null>(null);

  const bars: Bar[] = useMemo(
    () =>
      tasks.map((t) => {
        const s = t.dueStart?.toMillis() ?? t.dueDate?.toMillis() ?? 0;
        const e = t.dueDate?.toMillis() ?? t.dueStart?.toMillis() ?? 0;
        return { task: t, start: startOfDay(s || e), end: startOfDay(e || s), hasDates: Boolean(s || e) };
      }),
    [tasks],
  );

  const domain = useMemo(() => {
    const dated = bars.filter((b) => b.hasDates);
    const now = startOfDay(Date.now());
    if (dated.length === 0) {
      const s = selectedSprint?.startDate?.toMillis() ?? now;
      const e = selectedSprint?.endDate?.toMillis() ?? now + 14 * DAY;
      return { start: startOfDay(s), end: startOfDay(e) };
    }
    let min = Math.min(...dated.map((b) => b.start));
    let max = Math.max(...dated.map((b) => b.end));
    min = Math.min(min, now);
    max = Math.max(max, now);
    return { start: min - DAY, end: max + DAY };
  }, [bars, selectedSprint]);

  const span = Math.max(DAY, domain.end - domain.start);
  const totalDays = Math.round(span / DAY);
  const step = totalDays > 30 ? 7 : totalDays > 14 ? 2 : 1;

  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = domain.start; t <= domain.end; t += step * DAY) out.push(t);
    return out;
  }, [domain, step]);

  const pct = (ms: number) => ((ms - domain.start) / span) * 100;
  const todayPct = pct(startOfDay(Date.now()));

  if (loading) {
    return <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>;
  }

  return (
    <div className="fade-in">
      <div className="view-header">
        <h1>Timeline{selectedSprint ? ` · ${selectedSprint.name}` : ' · Backlog'}</h1>
        <p>Dòng thời gian công việc theo hạn (bắt đầu → kết thúc).</p>
      </div>

      {tasks.length === 0 ? (
        <div className="glass empty">Chưa có task.</div>
      ) : (
        <div className="glass tl-wrap">
          <div className="tl-scroll">
            {/* Axis */}
            <div className="tl-axis">
              <div className="tl-row-label tl-axis-label muted">Task</div>
              <div className="tl-track tl-axis-track">
                {ticks.map((t) => (
                  <span key={t} className="tl-tick" style={{ left: `${pct(t)}%` }}>{label(t)}</span>
                ))}
                {todayPct >= 0 && todayPct <= 100 && (
                  <span className="tl-today" style={{ left: `${todayPct}%` }} title="Hôm nay" />
                )}
              </div>
            </div>

            {/* Rows */}
            {bars.map((b) => (
              <div className="tl-row" key={b.task.id} onClick={() => setEditing(b.task)}>
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
                        left: `${pct(b.start)}%`,
                        width: `${Math.max(1.5, pct(b.end + DAY) - pct(b.start))}%`,
                        background: STATUS_COLOR[b.task.status],
                      }}
                    />
                  ) : (
                    <span className="tl-nodate muted">chưa có hạn</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <TaskModal task={editing} defaultSprintId={editing.sprintId} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
