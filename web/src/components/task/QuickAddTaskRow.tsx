import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSprintContext } from '../../contexts/SprintContext';
import { createTask } from '../../lib/taskWrites';

interface Props {
  /** Feature mà task tạo ra sẽ gắn vào. null = không gắn feature nào. */
  featureId: string | null;
  sprintId: string | null;
  projectId: string | null;
}

/**
 * Ô thêm task nhanh đặt cuối mỗi mục feature: gõ tên rồi Enter là xong.
 *
 * Bối cảnh đã nói hết phần còn lại nên không hỏi lại — feature lấy từ mục đang đứng,
 * người nhận là chính người gõ (ai thêm vào feature của mình thì nhận luôn), sprint/dự án
 * theo màn hình. Muốn đổi thì mở chi tiết task sửa sau; ở đây ưu tiên gõ liên tiếp nhiều
 * task nên ô không mất focus và không đóng lại sau mỗi lần tạo.
 */
export default function QuickAddTaskRow({ featureId, sprintId, projectId }: Props) {
  const { user } = useAuth();
  const { members, projects } = useSprintContext();
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const me = members.find((m) => m.uid === user?.uid) ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = title.trim();
    if (!name || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createTask(
        {
          title: name,
          description: '',
          sprintId,
          projectId,
          featureId,
          status: 'todo',
          priority: 'medium',
          points: 0,
          assigneeId: user?.uid ?? null,
          dueDate: null,
          attachments: [],
          subtasks: [],
          watcherIds: [],
        },
        {
          reporterId: user?.uid ?? '',
          assigneeName: me?.displayName ?? '',
          assigneeNotionUserId: me?.notionUserId ?? null,
          notionProjectId: projects.find((p) => p.id === projectId)?.notionProjectId ?? null,
          watcherNames: [],
        },
      );
      setTitle('');
    } catch (err) {
      console.error('Thêm nhanh task thất bại', err);
      setError('Tạo thất bại. Kiểm tra quyền hoặc kết nối.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="quick-add" onSubmit={submit}>
      <span className="quick-add-plus" aria-hidden>＋</span>
      <input
        className="quick-add-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Thêm task nhanh — giao cho chính bạn"
        disabled={saving}
        aria-label="Tên task mới"
      />
      {title.trim() !== '' && (
        <button type="submit" className="btn-sm" disabled={saving}>
          {saving ? 'Đang tạo…' : 'Thêm'}
        </button>
      )}
      {error && <span className="quick-add-error">{error}</span>}
    </form>
  );
}
