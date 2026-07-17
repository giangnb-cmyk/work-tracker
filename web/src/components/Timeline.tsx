import { useMemo, useState } from 'react';
import { useSprintContext } from '../contexts/SprintContext';
import { useProjectTasks } from '../hooks/useProjectTasks';
import { useFeatureLabels } from '../hooks/useFeatureLabels';
import DateRangePicker from './DateRangePicker';
import TaskModal from './TaskModal';
import { TIMELINE_PRESETS, startOfDay, type DateRange } from '../lib/dateRange';
import { buildVersionRows, type FeatureRow, type TaskBar, type VersionRow } from '../lib/timelineRows';
import TimelineFeatureRow, { type TimelineScale } from './timeline/TimelineFeatureRow';
import FeatureTasksModal from './timeline/FeatureTasksModal';
import type { Feature, Task } from '../types';

const DAY = 86_400_000;

function label(ms: number): string {
  return new Date(ms).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

/**
 * Timeline CẢ DỰ ÁN theo ba tầng: version → feature → task. Bar của tầng nào cũng phủ
 * từ task sớm nhất tới hạn muộn nhất của nó, fill = % task xong. Mặc định đóng hết —
 * mở ra mới thấy tầng dưới; đóng lại thì đây chính là lộ trình phát hành.
 *
 * Khoảng thời gian chọn bằng DateRangePicker (cùng bộ với tab Truy cập, nhưng cho phép
 * tương lai).
 */
export default function Timeline() {
  const { selectedProjectId, selectedProject, features } = useSprintContext();
  const { tasks, loading } = useProjectTasks(selectedProjectId);
  const { labels } = useFeatureLabels(selectedProjectId);
  // null = "cả dự án": khung tự co giãn theo min→max hạn của toàn bộ task.
  const [range, setRange] = useState<DateRange | null>(null);
  const [openVersions, setOpenVersions] = useState<Set<string>>(new Set());
  /** Feature đang mở popup danh sách task; null = không mở. */
  const [taskListRow, setTaskListRow] = useState<FeatureRow | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const taskBars: TaskBar[] = useMemo(
    () =>
      tasks.map((t) => {
        const s = t.dueStart?.toMillis() ?? t.dueDate?.toMillis() ?? 0;
        const e = t.dueDate?.toMillis() ?? t.dueStart?.toMillis() ?? 0;
        return { task: t, start: startOfDay(s || e), end: startOfDay(e || s), hasDates: Boolean(s || e) };
      }),
    [tasks],
  );

  /**
   * Khung "cả dự án": min→max các task có hạn, luôn chứa hôm nay VÀ mọi ngày phát hành.
   *
   * Phải tính cả ngày phát hành: lịch release chốt trước, thường nằm xa hơn hạn task
   * cuối cùng — bỏ ra ngoài thì bar version bị kẹp lại ở mép, nhìn như đã tới nơi.
   */
  const projectDomain = useMemo(() => {
    const now = startOfDay(Date.now());
    const marks = [
      ...taskBars.filter((b) => b.hasDates).flatMap((b) => [b.start, b.end]),
      ...labels.map((l) => l.releaseDate?.toMillis()).filter((ms): ms is number => Boolean(ms)),
    ];
    if (marks.length === 0) return { start: now - DAY, end: now + 30 * DAY };
    return {
      start: Math.min(...marks, now) - DAY,
      end: Math.max(...marks, now) + DAY,
    };
  }, [taskBars, labels]);

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

  const versionRows: VersionRow[] = useMemo(() => buildVersionRows(rows, labels), [rows, labels]);

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
  const scale: TimelineScale = { pct, clampPct, todayPct, label };

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
          <p>Theo version — xổ một bản ra để xem feature, xổ feature để xem task.</p>
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
      ) : versionRows.length === 0 ? (
        <div className="glass empty">Không có task nào trong khoảng này.</div>
      ) : (
        <div className="glass tl-wrap">
          <div className="tl-scroll">
            {/* Axis */}
            <div className="tl-axis">
              <div className="tl-row-label tl-axis-label muted">Version · Feature · Task</div>
              <div className="tl-track tl-axis-track">
                {ticks.map((t) => (
                  <span key={t} className="tl-tick" style={{ left: `${pct(t)}%` }}>{label(t)}</span>
                ))}
                {todayPct >= 0 && todayPct <= 100 && (
                  <span className="tl-today" style={{ left: `${todayPct}%` }} title="Hôm nay" />
                )}
              </div>
            </div>

            {/* Version → feature → task */}
            {versionRows.map((v) => {
              const vOpen = openVersions.has(v.key);
              const vDonePct = v.total === 0 ? 0 : Math.round((v.done / v.total) * 100);
              const vLeft = clampPct(pct(v.start));
              const vRight = clampPct(pct(v.end + DAY));
              return (
                <div key={v.key}>
                  <div
                    className="tl-row tl-ver"
                    onClick={() => setOpenVersions((s) => toggle(s, v.key))}
                  >
                    <div className="tl-row-label">
                      <span className={`tl-caret${vOpen ? ' open' : ''}`} aria-hidden>▸</span>
                      <span className="tl-name">
                        {v.label ? `🏷️ ${v.label.name}` : '📦 Chưa gắn version'}
                      </span>
                      <span className="muted tl-who mono">
                        {/* Ngày phát hành chốt ở sheet — hiện thẳng ra, đây là con số
                            người ta mở Timeline lên để tìm. */}
                        {v.releaseMs !== null && `🚩 ${label(v.releaseMs)} · `}
                        {v.rows.length} feature · {v.done}/{v.total}
                      </span>
                    </div>
                    <div className="tl-track">
                      {todayPct >= 0 && todayPct <= 100 && (
                        <span className="tl-today faint" style={{ left: `${todayPct}%` }} />
                      )}
                      {v.hasDates ? (
                        <span
                          className="tl-bar tl-feat-bar tl-ver-bar"
                          title={`${label(v.start)} → ${label(v.end)} · ${vDonePct}% xong`}
                          style={{
                            left: `${vLeft}%`,
                            width: `${Math.max(1.5, vRight - vLeft)}%`,
                            background: 'rgba(99, 102, 241, 0.2)',
                          }}
                        >
                          <span
                            className="tl-feat-fill"
                            style={{ width: `${vDonePct}%`, background: 'var(--primary)' }}
                          />
                        </span>
                      ) : (
                        <span className="tl-nodate muted">chưa có hạn</span>
                      )}
                    </div>
                  </div>

                  {vOpen && v.rows.map((row) => (
                    <TimelineFeatureRow
                      key={`${v.key}:${row.feature?.id ?? 'other'}`}
                      row={row}
                      onOpen={() => setTaskListRow(row)}
                      scale={scale}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {taskListRow && (
        <FeatureTasksModal
          row={taskListRow}
          onClose={() => setTaskListRow(null)}
          // Đóng popup trước rồi mới mở chi tiết: hai lớp popup chồng nhau đọc không ra.
          onJump={(t) => { setTaskListRow(null); setEditing(t); }}
        />
      )}

      {editing && (
        <TaskModal task={editing} defaultSprintId={editing.sprintId} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
