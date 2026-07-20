import { useMemo, useState } from 'react';
import { buildDeptNotes, buildMeetingNote, type NoteScope } from '../lib/meetingNote';
import { taskPath, taskShortPath } from '../lib/router';
import type { DeptTaskGroup } from '../lib/taskGrouping';
import type { Task } from '../types';

interface MeetingNoteModalProps {
  title: string;
  groups: DeptTaskGroup[];
  onClose: () => void;
}

/** Discord: 1 tin nhắn tối đa 2000 ký tự — khúc nào vượt sẽ bị cắt/không gửi được. */
const DISCORD_LIMIT = 2000;

/**
 * Link trong note phải trỏ về WEB THẬT, không phải localhost lúc dev. Lấy từ VITE_APP_URL
 * nếu có (đặt được cho preview/đổi domain), mặc định domain production NGẮN. Bỏ dấu '/' cuối
 * để khỏi ghép thành '//tasks'.
 */
const APP_BASE_URL = (import.meta.env.VITE_APP_URL || 'https://m-plan.easygoing.vn').replace(/\/+$/, '');

/** Sentinel cho nút "Copy tất cả" (phân biệt với key của các bộ phận). */
const ALL_KEY = '__all__';

/**
 * Link tuyệt đối tới web thật. Ưu tiên link RÚT GỌN /t/<mã> (ngắn ~½, đỡ ăn trần 2000 ký
 * tự Discord); task cũ hiếm khi chưa có short_code thì lui về /tasks/<id>?p=<proj> đầy đủ.
 */
const taskLinkFor = (t: Task): string =>
  APP_BASE_URL + (t.shortCode ? taskShortPath(t.shortCode) : taskPath(t.id, t.projectId));

/**
 * Xem trước + copy note họp. Cố ý CÓ ô xem trước thay vì copy thẳng:
 * - người dùng kiểm được nội dung trước khi dán vào chỗ cả đội đọc;
 * - clipboard API cần ngữ cảnh bảo mật (https/localhost) và có thể bị chặn — khi đó vẫn
 *   bôi đen copy tay được, không kẹt.
 *
 * Copy TỪNG BỘ PHẬN vì note cả sprint dễ vượt trần 2000 ký tự của 1 tin Discord — mỗi bộ
 * phận dán làm 1 tin riêng, kèm sẵn số ký tự để biết khúc nào còn vượt.
 */
export default function MeetingNoteModal({ title, groups, onClose }: MeetingNoteModalProps) {
  const [scope, setScope] = useState<NoteScope>('open');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const text = useMemo(() => buildMeetingNote(title, groups, scope, taskLinkFor), [title, groups, scope]);
  const depts = useMemo(() => buildDeptNotes(title, groups, scope, taskLinkFor), [title, groups, scope]);

  async function copy(payload: string, key: string) {
    setError(null);
    try {
      await navigator.clipboard.writeText(payload);
      setCopiedKey(key);
      // Chỉ xoá dấu ✓ nếu chưa có nút khác được bấm đè lên.
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1800);
    } catch (err) {
      console.error('Copy note họp thất bại', err);
      setError('Trình duyệt chặn clipboard. Bôi đen nội dung bên dưới rồi Ctrl+C.');
    }
  }

  const totalTasks = text.split('\n').filter((l) => l.startsWith('- ')).length;

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
          <span className="muted" style={{ fontSize: '0.8rem' }}>{totalTasks} task</span>
        </div>

        <textarea className="input note-preview" value={text} readOnly spellCheck={false} />

        {depts.length > 0 && (
          <div className="note-depts">
            <div className="note-depts-head">
              Copy theo bộ phận — mỗi khúc dán làm 1 tin, né trần {DISCORD_LIMIT} ký tự của Discord
            </div>
            {depts.map((d) => {
              const over = d.text.length > DISCORD_LIMIT;
              return (
                <button
                  key={d.key}
                  type="button"
                  className={`note-dept${over ? ' over' : ''}`}
                  onClick={() => copy(d.text, d.key)}
                  title={over ? `Khúc này ${d.text.length} ký tự, vượt ${DISCORD_LIMIT} — Discord sẽ cắt` : undefined}
                >
                  <span className="note-dept-name">{d.icon} {d.label}</span>
                  <span className="note-dept-meta mono">
                    {d.taskCount} việc · {d.text.length.toLocaleString('vi-VN')}/{DISCORD_LIMIT}
                  </span>
                  <span className="note-dept-cta">{copiedKey === d.key ? '✓ Đã copy' : 'Copy'}</span>
                </button>
              );
            })}
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <button className="btn-sm" onClick={onClose}>Đóng</button>
          <button className="btn-primary" onClick={() => copy(text, ALL_KEY)}>
            {copiedKey === ALL_KEY ? '✓ Đã copy' : 'Copy tất cả'}
          </button>
        </div>
      </div>
    </div>
  );
}
