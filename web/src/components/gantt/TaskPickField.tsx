import { useMemo, useState } from 'react';
import { foldDiacritics } from '../../lib/text';
import { STATUS_LABEL, type Task } from '../../types';

interface Props {
  tasks: Task[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Task đã gắn vào chart TỪ CHI TIẾT TASK (tasks.chart_id, 0088) — hiện tick sẵn, không bỏ được ở đây. */
  lockedIds?: string[];
  disabled?: boolean;
}

/** Danh sách dài thì cắt, gõ tìm để thấy phần còn lại — 200 dòng checkbox không ai cuộn. */
const MAX_SHOWN = 60;
const NO_LOCK: string[] = [];

/**
 * Chọn nhiều task của dự án cho chart tốc độ link kiểu "tasks". Task đã chọn nổi lên đầu để
 * thấy ngay phạm vi hiện tại; ô tìm lọc theo tên không dấu. Task gắn từ phía task thì khoá:
 * gỡ nó phải làm ở chính task (nguồn sự thật của liên kết đó nằm ở hàng task).
 */
export default function TaskPickField({ tasks, selectedIds, onChange, lockedIds = NO_LOCK, disabled }: Props) {
  const [query, setQuery] = useState('');
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const locked = useMemo(() => new Set(lockedIds), [lockedIds]);
  const isOn = (id: string) => selected.has(id) || locked.has(id);

  const shown = useMemo(() => {
    const q = foldDiacritics(query.trim());
    const list = q ? tasks.filter((t) => foldDiacritics(t.title).includes(q)) : tasks;
    return [...list].sort((a, b) => Number(isOn(b.id)) - Number(isOn(a.id))).slice(0, MAX_SHOWN);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, query, selected, locked]);

  function toggle(id: string) {
    if (locked.has(id)) return;
    onChange(selected.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  const total = new Set([...selectedIds, ...lockedIds]).size;

  return (
    <div className="tpick">
      <div className="tpick-head">
        <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Gõ để tìm task…" disabled={disabled} />
        <span className="gantt-meta">{total} task trong phạm vi</span>
      </div>
      <ul className="tpick-list">
        {shown.length === 0 && <li className="plog-empty">Không có task nào khớp.</li>}
        {shown.map((t) => {
          const lock = locked.has(t.id);
          return (
            <li key={t.id}>
              <label className={`tpick-item${isOn(t.id) ? ' on' : ''}`} title={lock ? 'Gắn từ chi tiết task. Gỡ ở chính task đó.' : undefined}>
                <input type="checkbox" checked={isOn(t.id)} onChange={() => toggle(t.id)} disabled={disabled || lock} />
                <span className="tpick-title">{t.title}</span>
                <span className="gantt-meta">
                  {lock ? 'gắn từ task' : t.status === 'done' ? 'Xong' : STATUS_LABEL[t.status]}
                  {t.chartQty !== null && t.chartQty !== undefined && t.chartQty !== 1 ? ` · ×${t.chartQty}` : ''}
                </span>
              </label>
            </li>
          );
        })}
        {tasks.length > shown.length && !query && (
          <li className="gantt-meta" style={{ padding: '0.35rem 0.4rem' }}>…còn {tasks.length - shown.length} task nữa, gõ tìm để chọn.</li>
        )}
      </ul>
    </div>
  );
}
