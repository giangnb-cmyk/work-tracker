import { useState } from 'react';
import Avatar from '../Avatar';
import Linkify from '../Linkify';
import { PencilIcon } from '../icons';
import { editComment } from '../../lib/activityWrites';
import { timeAgo } from '../../lib/format';
import { STATUS_LABEL, type Activity, type TaskStatus } from '../../types';

/** Câu mô tả sự kiện. Nội dung bình luận hiện riêng bên dưới, không nhét vào câu này. */
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

interface Props {
  activity: Activity;
  /** Hiện nút bút chì. Chỉ là lớp thuận tiện — RLS + trigger 0029 mới là lớp chặn thật. */
  canEdit: boolean;
}

/**
 * Một dòng trong nhật ký hoạt động; bình luận của chính mình sửa được tại chỗ.
 *
 * Trạng thái `editing` nằm ở ĐÂY chứ không ở riêng phần nội dung: nút bút chì đứng cùng
 * hàng với tên, nên nó phải điều khiển được cả phần thân bên dưới.
 */
export default function ActivityItem({ activity, canEdit }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(activity.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function start() {
    // Lấy lại bản mới nhất chứ không dùng `text` cũ: feed là live query nên nội dung có
    // thể đã đổi, mà bản nháp gõ dở lần trước cũng không nên sống lại.
    setText(activity.body);
    setError(null);
    setEditing(true);
  }

  async function save() {
    const body = text.trim();
    if (!body || saving) return;
    if (body === activity.body) { setEditing(false); return; } // không đổi gì -> khỏi ghi
    setSaving(true);
    setError(null);
    try {
      await editComment(activity.id, body);
      setEditing(false);
    } catch (err) {
      console.error('Sửa bình luận thất bại', err);
      setError('Sửa thất bại — chỉ tác giả mới sửa được bình luận này.');
    } finally {
      setSaving(false);
    }
  }

  const name = activity.actorName || 'Hệ thống';

  return (
    <li className="tm-feed-item">
      <Avatar name={name} size="sm" />
      <div className="tm-feed-body">
        <div className="tm-feed-line">
          <span className="tm-feed-said">
            <strong>{name}</strong> {actionText(activity)}
          </span>
          {canEdit && !editing && (
            <button
              type="button"
              className="tm-feed-edit"
              onClick={start}
              title="Sửa bình luận"
              aria-label="Sửa bình luận"
            >
              <PencilIcon size={13} />
            </button>
          )}
        </div>

        {activity.type === 'comment' && !editing && (
          <div className="tm-feed-comment"><Linkify text={activity.body} /></div>
        )}

        {editing && (
          <div className="tm-feed-editbox">
            <textarea
              className="textarea tm-feed-editarea"
              rows={3}
              value={text}
              autoFocus
              disabled={saving}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                // Esc huỷ. Ctrl/Cmd+Enter lưu — Enter trần vẫn xuống dòng, y như lúc viết mới.
                if (e.key === 'Escape') setEditing(false);
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void save(); }
              }}
            />
            {error && <p className="error-text">{error}</p>}
            <div className="tm-feed-editrow">
              <button type="button" className="btn-sm" onClick={() => setEditing(false)} disabled={saving}>
                Huỷ
              </button>
              <button type="button" className="btn-sm" onClick={() => void save()} disabled={saving || !text.trim()}>
                {saving ? 'Đang lưu…' : 'Lưu'}
              </button>
            </div>
          </div>
        )}

        <div className="tm-feed-time">
          {timeAgo(activity.createdAt)}
          {activity.editedAt && <span className="tm-feed-edited"> · đã sửa</span>}
        </div>
      </div>
    </li>
  );
}
