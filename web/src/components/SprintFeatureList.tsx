import { useMemo, useState } from 'react';
import TaskListRow from './TaskListRow';
import QuickAddTaskRow from './task/QuickAddTaskRow';
import { NO_FEATURE_KEY, type FeatureTaskGroup } from '../lib/taskGrouping';
import type { JobRole, Task, TaskStatus } from '../types';

interface Props {
  groups: FeatureTaskGroup[];
  sprintId: string | null;
  projectId: string | null;
  /** Đang lọc: mọi mục xổ sẵn, và câu báo rỗng phải nói "không khớp" chứ không phải "chưa có". */
  filtering: boolean;
  jobRoleOf: (uid: string | null) => JobRole | undefined;
  canChangeStatus: (t: Task) => boolean;
  onOpen: (t: Task) => void;
  onQuickStatus: (t: Task, s: TaskStatus) => void;
  onMoveSprint?: (t: Task) => void;
}

/**
 * Danh sách sprint gom theo FEATURE — cách nhìn thứ hai bên cạnh "theo bộ phận".
 *
 * Xổ/thu từng feature vì một sprint có thể chạm chục feature: mở hết thì lại thành đúng
 * danh sách phẳng đang có, chẳng thêm được gì. Mặc định THU để nhìn ra ngay feature nào
 * đang gánh nhiều việc và feature nào đứng im.
 */
export default function SprintFeatureList({
  groups,
  sprintId,
  projectId,
  filtering,
  jobRoleOf,
  canChangeStatus,
  onOpen,
  onQuickStatus,
  onMoveSprint,
}: Props) {
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

  // CHỈ feature có task trong sprint này. Dự án có hàng chục feature mà sprint chỉ chạm
  // vài cái — liệt kê hết thì mục thật chìm trong một rừng "0 task". Muốn gắn task vào
  // feature chưa có mặt ở đây thì tạo task rồi chọn feature trong chi tiết.
  const shown = useMemo(() => groups.filter((g) => g.tasks.length > 0), [groups]);

  function toggle(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (shown.length === 0) {
    return (
      <div className="glass empty">
        {filtering ? 'Không có task nào khớp bộ lọc.' : 'Sprint này chưa có task nào gắn feature.'}
      </div>
    );
  }

  return (
    <>
      {shown.map((g) => {
        const open = filtering || openKeys.has(g.key);
        const total = g.tasks.length;
        const pct = total === 0 ? 0 : Math.round((g.done / total) * 100);
        const noFeature = g.key === NO_FEATURE_KEY;
        return (
          <section key={g.key} className="feat-group">
            <button
              className={`feat-group-head${open ? ' open' : ''}`}
              onClick={() => toggle(g.key)}
              aria-expanded={open}
            >
              <span className="feat-group-caret" aria-hidden>{open ? '▾' : '▸'}</span>
              {noFeature ? (
                <span className="feat-group-none">📥 Chưa gắn feature</span>
              ) : (
                <span className="sfeat-name" style={{ color: g.feature?.color || undefined }}>
                  <span aria-hidden>{g.feature?.icon || '🎯'}</span> {g.feature?.name}
                </span>
              )}
              <span className="feat-group-count">{total} task</span>
              <span className="progress sfeat-bar" aria-hidden>
                <span style={{ width: `${pct}%` }} />
              </span>
              <span className="feat-group-done mono">{g.done}/{total}</span>
            </button>

            {open && (
              <div className="feat-group-grid">
                <div className="trow-list">
                  {g.tasks.map((t) => (
                    <TaskListRow
                      key={t.id}
                      task={t}
                      assigneeJobRole={jobRoleOf(t.assigneeId) ?? undefined}
                      canChangeStatus={canChangeStatus(t)}
                      onOpen={onOpen}
                      onQuickStatus={onQuickStatus}
                      onMoveSprint={onMoveSprint && canChangeStatus(t) ? onMoveSprint : undefined}
                    />
                  ))}
                </div>
                <QuickAddTaskRow
                  featureId={noFeature ? null : g.key}
                  sprintId={sprintId}
                  projectId={projectId}
                />
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
