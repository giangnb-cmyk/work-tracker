import { useEffect, useState } from 'react';
import { duplicateFeature, fetchFeatureTasks } from '../lib/duplicateWrites';
import { useAuth } from '../contexts/AuthContext';
import type { Feature, Task } from '../types';

interface Props {
  feature: Feature;
  /** Nhân bản xong -> chỗ gọi tự nạp lại danh sách feature rồi đóng modal. */
  onDone: (newFeatureId: string) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Gợi ý tên cho bản sao: SỐ CUỐI TÊN tăng thêm 1 ("Map 1" -> "Map 2", "Boss 09" -> "Boss 10").
 *
 * Đây đúng là cách feature được đặt tên khi làm hàng loạt (Map 1, Map 2…), nên đoán sẵn
 * thì hầu như chỉ cần bấm Enter. Không có số ở cuối thì lùi về hậu tố "(bản sao)".
 * Giữ nguyên số 0 ở đầu ("09" -> "10", không phải "9" -> "10") để tên không lệch kiểu.
 */
export function suggestCopyName(name: string): string {
  const m = name.trim().match(/^(.*?)(\d+)(\s*)$/);
  if (!m) return `${name.trim()} (bản sao)`;
  const [, head, digits, tail] = m;
  const next = String(Number(digits) + 1).padStart(digits.length, '0');
  return `${head}${next}${tail}`;
}

/**
 * Hộp thoại nhân bản feature KÈM toàn bộ task bên trong — dựng "Map 2" từ "Map 1" mà không
 * phải gõ lại từng task y hệt.
 *
 * Tự nạp task của feature (không nhận từ ngoài): chỗ gọi thường chỉ có task của sprint đang
 * xem, mà bản sao thì phải đủ CẢ feature kể cả task nằm ở sprint cũ hay backlog.
 */
export default function DuplicateFeatureModal({ feature, onDone, onCancel }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState(() => suggestCopyName(feature.name));
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchFeatureTasks(feature.id)
      .then((rows) => alive && setTasks(rows))
      .catch((err) => {
        console.error('Đọc task của feature thất bại', err);
        if (alive) setError('Không đọc được danh sách task của feature này.');
      });
    return () => {
      alive = false;
    };
  }, [feature.id]);

  const subtaskCount = (tasks ?? []).reduce((n, t) => n + (t.subtasks?.length ?? 0), 0);
  const nameInvalid = name.trim().length === 0;

  async function submit() {
    if (nameInvalid || busy || tasks === null) return;
    setBusy(true);
    setError(null);
    try {
      const r = await duplicateFeature(feature, name, tasks, user?.uid ?? '');
      await onDone(r.featureId);
    } catch (err) {
      console.error('Nhân bản feature thất bại', err);
      setError('Nhân bản thất bại. Cần quyền admin, hoặc kiểm tra kết nối.');
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h2>Nhân bản feature</h2>

        <label className="field">
          <span>Tên feature mới *</span>
          <input
            className="input"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>

        <p className="muted" style={{ fontSize: '0.82rem' }}>
          {tasks === null ? (
            <>⏳ Đang đếm task trong “{feature.name}”…</>
          ) : tasks.length === 0 ? (
            <>Feature “{feature.name}” chưa có task nào — bản sao sẽ là một feature rỗng
              (vẫn chép icon, mô tả, nhãn, tài liệu và người tham gia).</>
          ) : (
            <>Chép <strong>{tasks.length} task</strong>
              {subtaskCount > 0 && <> kèm <strong>{subtaskCount} subtask</strong></>} từ
              “{feature.name}” sang feature mới.</>
          )}
        </p>

        <p className="muted" style={{ fontSize: '0.78rem' }}>
          💡 Task chép sang giữ tên, mô tả, người nhận, ưu tiên và tài liệu; nhưng về
          <strong> Backlog</strong> ở trạng thái “Cần làm”, chưa có hạn và subtask bỏ tick hết —
          kéo vào sprint khi nào bắt đầu làm. Bản sao <strong>không</strong> tạo trang Notion và
          không bắn thông báo Discord (chép 12 task mà nổ 12 tin thì ngập kênh).
        </p>

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <button className="btn-sm" onClick={onCancel} disabled={busy}>Huỷ</button>
          <button className="btn-primary" onClick={() => void submit()} disabled={busy || nameInvalid || tasks === null}>
            {busy ? 'Đang chép…' : 'Nhân bản'}
          </button>
        </div>
      </div>
    </div>
  );
}
