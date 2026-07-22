import { useState } from 'react';
import { formatVnd } from '../../lib/format';
import { COST_ITEM_KIND_LABEL, type CostItem } from '../../types';

interface Props {
  /** Tiêu đề: tên nhân sự hoặc dòng dự chi đang gán. */
  title: string;
  /** Dòng phụ giải thích cách tính (khác nhau giữa nhân sự và dự chi). */
  hint: string;
  items: CostItem[];
  selectedIds: string[];
  /** Gọi MỖI lần tick — parent ghi nền (optimistic); modal tự giữ state nên tick là thấy ngay. */
  onChange: (ids: string[]) => void;
  onClose: () => void;
}

/**
 * Popup multi-select khoản chi phí thiết bị/vận hành cho một người / một dòng dự chi.
 * State chọn giữ CỤC BỘ (tick phản hồi 0ms), mỗi lần tick bắn onChange để parent ghi nền.
 */
export default function ItemPickerModal({ title, hint, items, selectedIds, onChange, onClose }: Props) {
  const [selected, setSelected] = useState<string[]>(selectedIds);

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setSelected(next);
    onChange(next);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>🖥️ Chi phí cho “{title}”</h2>
        <p className="muted" style={{ fontSize: '0.82rem', marginBottom: '0.9rem' }}>{hint}</p>

        {items.length === 0 ? (
          <div className="glass empty">Chưa có khoản chi phí nào — thêm ở bảng “Chi phí thiết bị &amp; vận hành”.</div>
        ) : (
          <div className="cost-picker-list">
            {items.map((it) => (
              <label key={it.id} className={`picker-row${selected.includes(it.id) ? ' on' : ''}`}>
                <input type="checkbox" checked={selected.includes(it.id)} onChange={() => toggle(it.id)} />
                <span className="picker-name">{it.name || '(chưa đặt tên)'}</span>
                <span className="muted cost-picker-meta">
                  {COST_ITEM_KIND_LABEL[it.kind]} · <span className="mono">{formatVnd(it.amount)}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose}>Xong</button>
        </div>
      </div>
    </div>
  );
}
