import { useEffect, useState } from 'react';
import { createProject, extractSheetId, updateProject, type ProjectInput } from '../lib/projectWrites';
import { listNotionProjects, type NotionProjectOption } from '../lib/notionSync';
import { useAuth } from '../contexts/AuthContext';
import SearchableSelect from './SearchableSelect';
import type { Project } from '../types';

interface ProjectModalProps {
  project?: Project | null; // null = create
  onClose: () => void;
}

/** Admin dialog to create/edit a project and link it to a Notion project. */
export default function ProjectModal({ project, onClose }: ProjectModalProps) {
  const { user } = useAuth();
  const isEdit = Boolean(project);
  const [name, setName] = useState(project?.name ?? '');
  const [icon, setIcon] = useState(project?.icon ?? '📁');
  const [description, setDescription] = useState(project?.description ?? '');
  const [notionProjectId, setNotionProjectId] = useState<string>(project?.notionProjectId ?? '');
  const [notionProjects, setNotionProjects] = useState<NotionProjectOption[]>([]);
  const [loadingNotion, setLoadingNotion] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Giữ nguyên thứ người dùng dán (link đầy đủ) — chỉ bóc id lúc lưu, để họ vẫn đọc được
  // đúng cái mình vừa dán thay vì thấy nó biến thành một chuỗi lạ.
  const [sheetInput, setSheetInput] = useState(project?.weeklySheetId ?? '');
  const [dailyWebhook, setDailyWebhook] = useState(project?.dailyReportWebhook ?? '');

  const sheetId = extractSheetId(sheetInput);
  const sheetInvalid = sheetInput.trim().length > 0 && !sheetId;
  // Kiểm tra nhẹ: webhook Discord luôn chứa '/api/webhooks/'. Rỗng = tắt (không gửi).
  const webhookInvalid = dailyWebhook.trim().length > 0 && !dailyWebhook.includes('/api/webhooks/');

  // Load the linkable Notion projects once when the dialog opens.
  useEffect(() => {
    let alive = true;
    listNotionProjects()
      .then((rows) => alive && setNotionProjects(rows))
      .catch((err) => console.error('Lấy danh sách project Notion thất bại', err))
      .finally(() => alive && setLoadingNotion(false));
    return () => {
      alive = false;
    };
  }, []);

  async function handleSave() {
    if (!name.trim()) {
      setError('Cần nhập tên project.');
      return;
    }
    if (sheetInvalid) {
      setError('Link Google Sheet không hợp lệ. Dán link dạng docs.google.com/spreadsheets/d/…');
      return;
    }
    if (webhookInvalid) {
      setError('Webhook Discord không hợp lệ. Dán link dạng https://discord.com/api/webhooks/…');
      return;
    }
    setSaving(true);
    setError(null);
    const input: ProjectInput = {
      name,
      icon,
      color: project?.color ?? '#6366f1',
      description,
      notionProjectId: notionProjectId || null,
      weeklySheetId: sheetId,
      dailyReportWebhook: dailyWebhook.trim() || null,
    };
    try {
      if (isEdit && project) {
        await updateProject(project.id, {
          name: name.trim(),
          icon,
          description: description.trim(),
          notionProjectId: notionProjectId || null,
          weeklySheetId: sheetId,
          dailyReportWebhook: dailyWebhook.trim() || null,
        });
      } else {
        await createProject(input, user?.uid ?? '');
      }
      onClose();
    } catch (err) {
      console.error('Lưu project thất bại', err);
      setError('Lưu thất bại. Cần quyền admin.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? 'Sửa project' : 'Project mới'}</h2>

        <div className="grid-2">
          <label className="field">
            <span>Icon</span>
            <input className="input" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={2} />
          </label>
          <label className="field">
            <span>Tên project *</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
        </div>

        <label className="field">
          <span>Mô tả</span>
          <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <label className="field">
          <span>Liên kết Notion project</span>
          <SearchableSelect
            value={notionProjectId}
            onChange={setNotionProjectId}
            options={notionProjects.map((p) => ({ value: p.id, label: p.name }))}
            disabled={loadingNotion}
            allowEmpty
            emptyLabel="— Không liên kết —"
            placeholder={loadingNotion ? 'Đang tải…' : 'Tìm project Notion…'}
          />
        </label>
        <p className="muted" style={{ fontSize: '0.78rem', marginBottom: '0.75rem' }}>
          💡 Liên kết để khi tạo task trong project này, Notion tự set đúng quan hệ Project.
        </p>

        <label className="field">
          <span>Google Sheet weekly report</span>
          <input
            className="input"
            value={sheetInput}
            onChange={(e) => setSheetInput(e.target.value)}
            placeholder="Dán link sheet: https://docs.google.com/spreadsheets/d/…"
          />
        </label>
        <p className="muted" style={{ fontSize: '0.78rem', marginBottom: '0.75rem' }}>
          {sheetInvalid ? (
            <span className="error-text">⚠ Không đọc được id từ link này.</span>
          ) : sheetId ? (
            <>✅ Sheet id: <span className="mono">{sheetId}</span> — mỗi project một sheet riêng.</>
          ) : (
            <>💡 Bot điền “đã hoàn thành tuần trước” + “kế hoạch tuần tới” vào sheet này mỗi
              sáng thứ 2. Nhớ Share sheet cho service account của bot với quyền <b>Editor</b>.</>
          )}
        </p>

        <label className="field">
          <span>Webhook Discord — báo cáo task hằng ngày</span>
          <input
            className="input"
            value={dailyWebhook}
            onChange={(e) => setDailyWebhook(e.target.value)}
            placeholder="https://discord.com/api/webhooks/…"
          />
        </label>
        <p className="muted" style={{ fontSize: '0.78rem', marginBottom: '0.75rem' }}>
          {webhookInvalid ? (
            <span className="error-text">⚠ Link webhook không đúng dạng (phải chứa /api/webhooks/).</span>
          ) : dailyWebhook.trim() ? (
            <>✅ 10:30 mỗi ngày làm việc, bot gửi task của project này vào kênh webhook, tag người theo Discord ID.</>
          ) : (
            <>💡 Dán webhook của kênh Discord để nhận báo cáo task hằng ngày (10:30). Rỗng = project này không gửi.</>
          )}
        </p>

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <button className="btn-sm" onClick={onClose} disabled={saving}>Huỷ</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Đang lưu…' : isEdit ? 'Lưu' : 'Tạo'}
          </button>
        </div>
      </div>
    </div>
  );
}
