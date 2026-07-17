import { useState } from 'react';
import ActivityItem from './task/ActivityItem';
import { useActivity } from '../hooks/useActivity';
import { addComment, canEditComment } from '../lib/activityWrites';

interface Props {
  taskId: string;
  actorId: string;
  actorName: string;
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
            <ActivityItem key={a.id} activity={a} canEdit={canEditComment(a, actorId)} />
          ))}
        </ul>
      )}
    </aside>
  );
}
