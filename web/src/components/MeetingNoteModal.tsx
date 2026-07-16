import { useMemo, useState } from 'react';
import { buildMeetingNote, type NoteScope } from '../lib/meetingNote';
import type { DeptTaskGroup } from '../lib/taskGrouping';

interface MeetingNoteModalProps {
  title: string;
  groups: DeptTaskGroup[];
  onClose: () => void;
}

/**
 * Xem trước + copy note họp. Cố ý CÓ ô xem trước thay vì copy thẳng:
 * - người dùng kiểm được nội dung trước khi dán vào chỗ cả đội đọc;
 * - clipboard API cần ngữ cảnh bảo mật (https/localhost) và có thể bị chặn — khi đó vẫn
 *   bôi đen copy tay được, không kẹt.
 */
export default function MeetingNoteModal({ title, groups, onClose }: MeetingNoteModalProps) {
  const [scope, setScope] = useState<NoteScope>('open');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const text = useMemo(() => buildMeetingNote(title, groups, scope), [title, groups, scope]);

  async function copy() {
    setError(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error('Copy note họp thất bại', err);
      setError('Trình duyệt chặn clipboard. Bôi đen nội dung bên dưới rồi Ctrl+C.');
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>Note họp</h2>
        <p className="perf-hint">
          Markdown — dán thẳng vào Discord hoặc Notion, cả hai đều render được.
        </p>

        <div className="filter-bar">
          <div className="seg-toggle" role="group" aria-label="Phạm vi">
            <button className={`seg${scope === 'open' ? ' on' : ''}`} onClick={() => setScope('open')}>
              Chưa xong
            </button>
            <button className={`seg${scope === 'all' ? ' on' : ''}`} onClick={() => setScope('all')}>
              Tất cả
            </button>
          </div>
          <span className="muted" style={{ fontSize: '0.8rem' }}>
            {text.split('\n').filter((l) => l.startsWith('- ')).length} task
          </span>
        </div>

        <textarea className="input note-preview" value={text} readOnly spellCheck={false} />

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <button className="btn-sm" onClick={onClose}>Đóng</button>
          <button className="btn-primary" onClick={copy}>
            {copied ? '✓ Đã copy' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
