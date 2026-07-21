import { useEffect, useMemo, useRef, useState } from 'react';
import Avatar from '../Avatar';
import { foldDiacritics } from '../../lib/text';
import { JOB_ROLE_LABEL, type TeamMember } from '../../types';

/** Tham chiếu ổn định cho "không loại ai" — khỏi tạo mảng mới mỗi lần render (vỡ useMemo). */
const NO_EXCLUDE: string[] = [];

interface Props {
  members: TeamMember[];
  watcherIds: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
  /** Nhãn field — mặc định cho watcher của task; FeatureModal đổi thành "người tham gia". */
  label?: string;
  /** Chữ hiện khi CHƯA có thành viên nào trong hệ thống. */
  emptyMembersHint?: string;
  /**
   * uid bị LOẠI khỏi cả danh sách hiện lẫn ô thêm — TaskModal truyền người NHẬN vào đây:
   * người nhận đã là người làm task, không cần liệt kê lại ở "người liên quan".
   */
  excludeIds?: string[];
}

/**
 * Related people (watchers) — they get mentioned on completion.
 *
 * Chỉ hiện người ĐÃ gắn; nút tròn "+" mở danh sách để thêm. Trước đây field xổ hết mọi
 * thành viên ra thành chip, nên chỉ gắn 1-2 người mà chiếm nguyên một bức tường.
 */
export default function WatchersField({
  members,
  watcherIds,
  onChange,
  disabled,
  label = 'Người liên quan (được báo khi hoàn thành)',
  emptyMembersHint = 'Chưa có thành viên.',
  excludeIds = NO_EXCLUDE,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => {
    const byId = new Map(members.map((m) => [m.uid, m]));
    // Duyệt theo watcherIds chứ không theo members: giữ đúng thứ tự người dùng đã thêm.
    // Loại excludeIds (người nhận) — dù còn trong watcherIds thì cũng không hiện lại.
    return watcherIds
      .filter((id) => !excludeIds.includes(id))
      .map((id) => byId.get(id))
      .filter((m): m is TeamMember => Boolean(m));
  }, [members, watcherIds, excludeIds]);

  const addable = useMemo(
    () => members.filter((m) => !watcherIds.includes(m.uid) && !excludeIds.includes(m.uid)),
    [members, watcherIds, excludeIds],
  );

  // Lọc theo tên (không dấu) — danh sách thành viên sẽ dài dần.
  const shown = useMemo(() => {
    const q = foldDiacritics(query.trim());
    return q ? addable.filter((m) => foldDiacritics(m.displayName).includes(q)) : addable;
  }, [addable, query]);

  // Mở panel: focus ô tìm. Đóng: xoá từ khoá để lần sau mở lại là danh sách đầy đủ.
  useEffect(() => {
    if (open) searchRef.current?.focus();
    else setQuery('');
  }, [open]);

  // Đóng khi bấm ra ngoài field.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Mất quyền sửa giữa chừng (modal chuyển sang chỉ đọc) thì đừng để panel treo lại.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  if (members.length === 0) {
    return (
      <div className="field">
        <span className="field-label">{label}</span>
        <span className="muted watcher-hint">{emptyMembersHint}</span>
      </div>
    );
  }

  return (
    <div className="field" ref={wrapRef}>
      <span className="field-label">{label}</span>

      <div className="watcher-list">
        {selected.map((m) => (
          <span key={m.uid} className="watcher-chip">
            <Avatar name={m.displayName} photoURL={m.photoURL} size="sm" />
            <span>{m.displayName}</span>
            {!disabled && (
              <button
                type="button"
                className="watcher-x"
                onClick={() => onChange(watcherIds.filter((id) => id !== m.uid))}
                aria-label={`Bỏ ${m.displayName} khỏi người liên quan`}
              >
                ×
              </button>
            )}
          </span>
        ))}

        {!disabled && addable.length > 0 && (
          <button
            type="button"
            className="watcher-add"
            onClick={() => setOpen((o) => !o)}
            aria-label="Thêm người liên quan"
            aria-expanded={open}
          >
            +
          </button>
        )}
      </div>

      {/* Panel là ANH EM của hàng chip chứ không nằm trong nó: in-flow (cùng lý do với
          .ss-panel — modal cuộn được sẽ cắt mất panel absolute), mà vẫn không xô lệch chip. */}
      {open && (
        <div className="watcher-pop glass">
          <input
            ref={searchRef}
            className="input watcher-search"
            value={query}
            placeholder="Gõ để tìm…"
            onChange={(e) => setQuery(e.target.value)}
          />
          {/* Ô tìm cố định ở trên, chỉ danh sách cuộn (giống .ss-panel). */}
          <div className="watcher-optlist">
            {shown.length === 0 ? (
              <span className="watcher-empty muted">Không có kết quả.</span>
            ) : (
              shown.map((m) => (
                <button
                  key={m.uid}
                  type="button"
                  className="watcher-opt"
                  onClick={() => onChange([...watcherIds, m.uid])}
                >
                  <Avatar name={m.displayName} photoURL={m.photoURL} size="sm" />
                  <span>{m.displayName}</span>
                  {m.jobRole && <span className="muted watcher-role">{JOB_ROLE_LABEL[m.jobRole]}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
