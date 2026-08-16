import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Avatar from '../Avatar';
import { useClickOutside } from '../../hooks/useClickOutside';
import { foldDiacritics } from '../../lib/text';
import { JOB_ROLE_LABEL, type TeamMember } from '../../types';

interface Props {
  /** uid người đang được giao; null = chưa giao. */
  value: string | null;
  onChange: (uid: string | null) => void;
  members: TeamMember[];
  disabled?: boolean;
  /** Hiện trong tooltip khi chưa giao ai. */
  emptyTitle?: string;
}

/**
 * Chọn MỘT người, hiện ra bằng ĐÚNG cái avatar — không kèm tên.
 *
 * Khác `SearchableSelect` (hiện nhãn chữ) ở chủ đích: dùng cho hàng chật như hàng subtask,
 * nơi tên người chiếm gần hết chiều ngang và đẩy tên subtask co lại. Avatar nhận ra người
 * nhanh hơn đọc chữ, tên vẫn có trong tooltip và trong danh sách chọn.
 *
 * Panel mở dạng absolute + neo mép PHẢI (ô nằm sát lề phải của modal), đóng bằng
 * `useClickOutside` — cùng khuôn với các dropdown khác trong app, đừng dùng backdrop fixed
 * (tổ tiên `.glass` có backdrop-filter sẽ nhốt nó lại — xem chú thích ở useClickOutside).
 */
export default function AssigneePicker({
  value,
  onChange,
  members,
  disabled,
  emptyTitle = 'Chưa giao — bấm để chọn người',
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useClickOutside(wrapRef, close, open);

  // Mở: focus ô tìm. Đóng: xoá từ khoá để lần sau mở ra là danh sách đầy đủ.
  useEffect(() => {
    if (open) searchRef.current?.focus();
    else setQuery('');
  }, [open]);

  // Mất quyền sửa giữa chừng thì đừng để panel treo lại.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const selected = members.find((m) => m.uid === value) ?? null;
  const shown = useMemo(() => {
    const q = foldDiacritics(query.trim());
    return q ? members.filter((m) => foldDiacritics(m.displayName).includes(q)) : members;
  }, [members, query]);

  function pick(uid: string | null) {
    onChange(uid);
    setOpen(false);
  }

  return (
    <div className="apick" ref={wrapRef}>
      <button
        type="button"
        className={`apick-trigger${selected ? '' : ' empty'}`}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title={selected ? `Giao cho ${selected.displayName}` : emptyTitle}
        aria-label={selected ? `Người làm: ${selected.displayName}` : 'Chưa giao'}
        aria-expanded={open}
      >
        {selected ? (
          <Avatar name={selected.displayName} photoURL={selected.photoURL} size="sm" />
        ) : (
          <span className="apick-empty" aria-hidden>+</span>
        )}
      </button>

      {open && (
        <div className="apick-pop glass">
          <input
            ref={searchRef}
            className="input apick-search"
            value={query}
            placeholder="Gõ để tìm…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          />
          <div className="apick-list">
            {value && (
              <button type="button" className="apick-opt" onClick={() => pick(null)}>
                <span className="apick-empty sm" aria-hidden>×</span>
                <span className="muted">Bỏ giao</span>
              </button>
            )}
            {shown.length === 0 ? (
              <span className="apick-none muted">Không có kết quả.</span>
            ) : (
              shown.map((m) => (
                <button
                  key={m.uid}
                  type="button"
                  className={`apick-opt${m.uid === value ? ' on' : ''}`}
                  onClick={() => pick(m.uid)}
                >
                  <Avatar name={m.displayName} photoURL={m.photoURL} size="sm" />
                  <span className="apick-name">{m.displayName}</span>
                  {m.jobRole && <span className="muted apick-role">{JOB_ROLE_LABEL[m.jobRole]}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
