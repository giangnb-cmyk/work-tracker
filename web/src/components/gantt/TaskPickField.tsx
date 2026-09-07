import { useMemo, useState } from 'react';
import { foldDiacritics } from '../../lib/text';
import { STATUS_LABEL, type Task } from '../../types';

interface Props {
  tasks: Task[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

/** Danh sách dài thì cắt, gõ tìm để thấy phần còn lại — 200 dòng checkbox không ai cuộn. */
const MAX_SHOWN = 60;

/**
 * Chọn nhiều task của dự án cho chart tốc độ link kiểu "tasks". Task đã chọn nổi lên đầu để
 * thấy ngay phạm vi hiện tại; ô tìm lọc theo tên không dấu.
 */
export default function TaskPickField({ tasks, selectedIds, onChange, disabled }: Props) {
  const [query, setQuery] = useState('');
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const shown = useMemo(() => {
    const q = foldDiacritics(query.trim());
    const list = q ? tasks.filter((t) => foldDiacritics(t.title).includes(q)) : tasks;
    // Đã chọn lên đầu, còn lại giữ thứ tự board.
    return [...list].sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id))).slice(0, MAX_SHOWN);
  }, [tasks, query, selected]);

  function toggle(id: string) {
    onChange(selected.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  return (
    <div className="tpick">
      <div className="tpick-head">
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Gõ để tìm task…"
          disabled={disabled}
        />
        <span className="gantt-meta">{selectedIds.length} task đã chọn</span>
      </div>
      <ul className="tpick-list">
        {shown.length === 0 && <li className="plog-empty">Không có task nào khớp.</li>}
        {shown.map((t) => (
          <li key={t.id}>
            <label className={`tpick-item${selected.has(t.id) ? ' on' : ''}`}>
              <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} disabled={disabled} />
              <span className="tpick-title">{t.title}</span>
              <span className="gantt-meta">{t.status === 'done' ? 'Xong' : STATUS_LABEL[t.status]}</span>
            </label>
          </li>
        ))}
        {tasks.length > shown.length && !query && (
          <li className="gantt-meta" style={{ padding: '0.35rem 0.4rem' }}>
            …còn {tasks.length - shown.length} task nữa, gõ tìm để chọn.
          </li>
        )}
      </ul>
    </div>
  );
}
