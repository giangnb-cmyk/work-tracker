import { useState } from 'react';
import Avatar from './Avatar';
import { useActivity } from '../hooks/useActivity';
import { addComment } from '../lib/activityWrites';
import { timeAgo } from '../lib/format';
import { STATUS_LABEL, type Activity, type TaskStatus } from '../types';

interface Props {
  taskId: string;
  actorId: string;
  actorName: string;
}

/** Renders the human sentence for an activity entry (comment body is shown separately). */
function actionText(a: Activity): string {
  switch (a.type) {
    case 'created':
      return 'đã tạo task này';
    case 'status_change':
      return `đã cập nhật trạng thái thành ${STATUS_LABEL[a.body as TaskStatus] ?? a.body}`;
    case 'comment':
      return 'đã bình luận';
    default:
      return 'đã cập nhật task';
  }
}

/** Right-hand Activity panel: live feed of events + a comment composer. */
export default function TaskActivity({ taskId, actorId, actorName }: Props) {
  const { items, loading } = useActivity(taskId);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  async function submit() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await addComment(taskId, actorId, actorName, body);
      setText('');
    } catch (err) {
      console.error('Thêm bình luận thất bại', err);
    } finally {
      setSending(false);
    }
  }

  return (
    <aside className="tm-activity">
      <div className="tm-activity-head">Activity</div>

      <div className="tm-comment">
        <textarea
          className="textarea"
          rows={2}
          placeholder="Viết bình luận…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn-sm" onClick={submit} disabled={sending || !text.trim()}>
          {sending ? 'Đang gửi…' : 'Bình luận'}
        </button>
      </div>

      {loading ? (
        <div className="empty" style={{ padding: '1rem' }}>Đang tải…</div>
      ) : items.length === 0 ? (
        <div className="empty" style={{ padding: '1rem' }}>Chưa có hoạt động.</div>
      ) : (
        <ul className="tm-feed">
          {items.map((a) => (
            <li key={a.id} className="tm-feed-item">
              <Avatar name={a.actorName || 'Hệ thống'} size="sm" />
              <div className="tm-feed-body">
                <div className="tm-feed-line">
                  <strong>{a.actorName || 'Hệ thống'}</strong> {actionText(a)}
                </div>
                {a.type === 'comment' && <div className="tm-feed-comment">“{a.body}”</div>}
                <div className="tm-feed-time">{timeAgo(a.createdAt)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
