import { useState } from 'react';
import { fmtInsertedAt, INSERT_KIND_TAG, type InsertedMemberRow, type InsertKind } from '../../lib/insertedTasks';
import { STATUS_LABEL, type Task } from '../../types';
import TaskModal from '../TaskModal';

const KIND_BADGE: Record<InsertKind, string> = {
  self: 'badge ins-self',
  admin: 'badge ins-admin',
  other: 'badge ins-other',
};

interface InsertedTasksDrawerProps {
  row: InsertedMemberRow;
  rangeLabel: string;
  onClose: () => void;
}

/** Danh sách task chèn của một người — task nào, tạo THỨ mấy, ai chèn. */
export default function InsertedTasksDrawer({ row, rangeLabel, onClose }: InsertedTasksDrawerProps) {
  const [openTask, setOpenTask] = useState<Task | null>(null);

  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xwide" onClick={(e) => e.stopPropagation()}>
        <h2>Task chèn · {row.name}</h2>
        <p className="perf-hint">
          {rangeLabel} · {row.total} task chèn — tự chèn {row.self} · PM chèn {row.byAdmin}
          {row.other > 0 ? ` · khác ${row.other}` : ''}
        </p>

        <div className="table-container perf-drawer-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Tạo lúc</th>
                <th>Người tạo</th>
                <th>Ai chèn</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {row.tasks.map(({ task, createdMs, kind, reporterName }) => (
                <tr key={task.id}>
                  <td>
                    <button className="ins-task-link" onClick={() => setOpenTask(task)}>
                      {task.title}
                    </button>
                  </td>
                  <td className="mono perf-when">{fmtInsertedAt(createdMs)}</td>
                  <td className="muted">{reporterName}</td>
                  <td><span className={KIND_BADGE[kind]}>{INSERT_KIND_TAG[kind]}</span></td>
                  <td>{STATUS_LABEL[task.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal-actions">
          <button className="btn-sm" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>

    {/* Là ANH EM của overlay drawer chứ không phải con: TaskModal tự mang overlay riêng —
        lồng vào trong thì cú bấm backdrop của nó nổi bọt lên overlay drawer, đóng cả hai. */}
    {openTask && (
      <TaskModal task={openTask} defaultSprintId={openTask.sprintId} onClose={() => setOpenTask(null)} />
    )}
    </>
  );
}
