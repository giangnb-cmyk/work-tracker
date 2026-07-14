import { useState } from 'react';
import type { Subtask } from '../../types';

interface Props {
  subtasks: Subtask[];
  onChange: (next: Subtask[]) => void;
  canEdit: boolean; // add/remove (admin)
  canToggle: boolean; // tick done (owner or admin)
}

/** Checklist of subtasks; the tick ratio drives the task progress bar. */
export default function SubtasksField({ subtasks, onChange, canEdit, canToggle }: Props) {
  const [title, setTitle] = useState('');
  const done = subtasks.filter((s) => s.done).length;

  function add() {
    const t = title.trim();
    if (!t) return;
    onChange([...subtasks, { id: crypto.randomUUID(), title: t, done: false }]);
    setTitle('');
  }

  function toggle(id: string) {
    onChange(subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  }

  function remove(id: string) {
    onChange(subtasks.filter((s) => s.id !== id));
  }

  return (
    <div className="field">
      <span className="field-label">
        Subtask {subtasks.length > 0 && <span className="muted mono">({done}/{subtasks.length})</span>}
      </span>

      {subtasks.map((s) => (
        <div key={s.id} className="subtask-row">
          <label className="subtask-check">
            <input
              type="checkbox"
              checked={s.done}
              disabled={!canToggle}
              onChange={() => toggle(s.id)}
            />
            <span className={s.done ? 'subtask-done' : ''}>{s.title}</span>
          </label>
          {canEdit && (
            <button type="button" className="attach-remove" onClick={() => remove(s.id)} title="Xoá">×</button>
          )}
        </div>
      ))}

      {canEdit && (
        <div className="row" style={{ gap: '0.4rem', marginTop: '0.4rem' }}>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
            placeholder="Thêm subtask…"
          />
          <button type="button" className="btn-sm" onClick={add}>Thêm</button>
        </div>
      )}
    </div>
  );
}
