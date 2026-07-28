import { useRef, useState } from 'react';
import AssigneePicker from './AssigneePicker';
import type { Subtask, TeamMember } from '../../types';

interface Props {
  subtasks: Subtask[];
  onChange: (next: Subtask[]) => void;
  canEdit: boolean; // add/remove/đổi người nhận (admin hoặc người tạo task)
  canToggle: boolean; // tick done (owner or admin)
  members: TeamMember[];
  /** Người đang đăng nhập — subtask mới tự giao cho chính họ. */
  currentUserId: string;
}

/** Checklist of subtasks; the tick ratio drives the task progress bar. */
export default function SubtasksField({
  subtasks,
  onChange,
  canEdit,
  canToggle,
  members,
  currentUserId,
}: Props) {
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const done = subtasks.filter((s) => s.done).length;
  const pct = subtasks.length ? Math.round((done / subtasks.length) * 100) : 0;

  const nameOf = (uid: string | null | undefined) =>
    (uid ? members.find((m) => m.uid === uid)?.displayName : '') ?? '';

  function add() {
    const t = title.trim();
    if (!t) return;
    // Tự giao cho CHÍNH NGƯỜI THÊM: gần như luôn đúng (người ta bẻ nhỏ việc của mình ra),
    // và subtask không có người nhận thì không lọt vào "Task của tôi" lẫn thống kê theo
    // người — mặc định "chưa giao" là mặc định vô hình. Đổi lại được ngay ở ô bên cạnh.
    onChange([
      ...subtasks,
      {
        id: crypto.randomUUID(),
        title: t,
        done: false,
        assigneeId: currentUserId || null,
        assigneeName: nameOf(currentUserId),
      },
    ]);
    setTitle('');
    // Keep the composer open & focused so adding several in a row is fast; the
    // growing list pushes the composer down naturally.
    inputRef.current?.focus();
  }

  function toggle(id: string) {
    onChange(subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  }

  /** Đổi người làm subtask. Ghi kèm tên (denormalize) như tasks.assigneeName. */
  function assign(id: string, uid: string | null) {
    onChange(
      subtasks.map((s) =>
        s.id === id ? { ...s, assigneeId: uid, assigneeName: nameOf(uid) } : s,
      ),
    );
  }

  function remove(id: string) {
    onChange(subtasks.filter((s) => s.id !== id));
  }

  function openAdd() {
    setAdding(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className="st-field">
      <div className="st-head">
        <h4 className="tm-h">
          Subtask
          {subtasks.length > 0 && <span className="st-count mono">{done}/{subtasks.length}</span>}
        </h4>
        {subtasks.length > 0 && (
          <span className="st-mini" aria-hidden>
            <span style={{ width: `${pct}%` }} />
          </span>
        )}
      </div>

      {subtasks.length > 0 && (
        <ul className="st-list">
          {subtasks.map((s) => (
            <li key={s.id} className={`st-row${s.done ? ' done' : ''}`}>
              <label className="st-check">
                <input
                  type="checkbox"
                  checked={s.done}
                  disabled={!canToggle}
                  onChange={() => toggle(s.id)}
                />
                <span className="st-box" aria-hidden>
                  <svg viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6.5L5 9l4.5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="st-title">{s.title}</span>
              </label>
              {/* Người làm subtask — chỉ AVATAR, không kèm tên: tên người chiếm gần hết
                  chiều ngang và bóp tên subtask lại. Tên vẫn có ở tooltip + danh sách chọn. */}
              <AssigneePicker
                value={s.assigneeId ?? null}
                onChange={(uid) => assign(s.id, uid)}
                members={members}
                disabled={!canEdit}
              />
              {canEdit && (
                <button type="button" className="st-del" onClick={() => remove(s.id)} title="Xoá subtask">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {subtasks.length === 0 && !adding && !canEdit && <p className="st-empty">Chưa có subtask.</p>}

      {/* Add control lives below the list, so each new subtask pushes it down. */}
      {canEdit && (
        adding ? (
          <div className="st-add">
            <input
              ref={inputRef}
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); add(); }
                if (e.key === 'Escape') { setAdding(false); setTitle(''); }
              }}
              placeholder="Tên subtask… (Enter để thêm — tự giao cho bạn)"
            />
            <button type="button" className="btn-sm" onClick={add}>Thêm</button>
          </div>
        ) : (
          <button type="button" className="st-addbtn" onClick={openAdd}>＋ Thêm subtask</button>
        )
      )}
    </div>
  );
}
