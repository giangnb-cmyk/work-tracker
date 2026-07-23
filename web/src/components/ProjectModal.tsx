import { useEffect, useState } from 'react';
import { createProject, extractSheetId, updateProject, type ProjectInput } from '../lib/projectWrites';
import { listNotionProjects, type NotionProjectOption } from '../lib/notionSync';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabase';
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
  const [costSheetInput, setCostSheetInput] = useState(project?.costSheetId ?? '');
  const [dailyWebhook, setDailyWebhook] = useState(project?.dailyReportWebhook ?? '');

  const sheetId = extractSheetId(sheetInput);
  const sheetInvalid = sheetInput.trim().length > 0 && !sheetId;
  const costSheetId = extractSheetId(costSheetInput);
  const costSheetInvalid = costSheetInput.trim().length > 0 && !costSheetId;
  // Kiểm tra nhẹ: webhook Discord luôn chứa '/api/webhooks/'. Rỗng = tắt (không gửi).
  const webhookInvalid = dailyWebhook.trim().length > 0 && !dailyWebhook.includes('/api/webhooks/');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  /** Gọi Edge Function daily-report ở chế độ TEST cho ĐÚNG project này -> gửi report thử
   *  (nhãn 🧪) vào webhook đang nhập. Chỉ edit mode (cần project.id) + đã có admin JWT. */
  async function handleTest() {
    if (!project) return;
    if (webhookInvalid || !dailyWebhook.trim()) {
      setTestMsg('⚠ Nhập webhook hợp lệ trước khi gửi thử.');
      return;
    }
    setTesting(true);
    setTestMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke('daily-report', {
        body: { projectId: project.id, webhook: dailyWebhook.trim() },
      });
      if (error) throw error;
      if (data?.ok) {
        setTestMsg(
          data.sent > 0
            ? `✅ Đã gửi thử (${data.sent} tin) — mở kênh Discord xem thử.`
            : '⚠ Gửi xong nhưng webhook trả lỗi — kiểm tra lại URL webhook.',
        );
      } else {
        setTestMsg(`❌ ${data?.message ?? 'Gửi thử thất bại.'}`);
      }
    } catch (err) {
      console.error('Gửi thử báo cáo thất bại', err);
      setTestMsg('❌ Gửi thử thất bại (cần quyền admin, hoặc kiểm tra kết nối).');
    } finally {
      setTesting(false);
    }
  }

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
    if (costSheetInvalid) {
      setError('Link Google Sheet CHI PHÍ không hợp lệ. Dán link dạng docs.google.com/spreadsheets/d/…');
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
      costSheetId,
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
          costSheetId,
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
          <span>Google Sheet CHI PHÍ (xuất từ tab Chi phí)</span>
          <input
            className="input"
            value={costSheetInput}
            onChange={(e) => setCostSheetInput(e.target.value)}
            placeholder="Dán link sheet RIÊNG chỉ admin xem: https://docs.google.com/spreadsheets/d/…"
          />
        </label>
        <p className="muted" style={{ fontSize: '0.78rem', marginBottom: '0.75rem' }}>
          {costSheetInvalid ? (
            <span className="error-text">⚠ Không đọc được id từ link này.</span>
          ) : costSheetId ? (
            <>✅ Sheet id: <span className="mono">{costSheetId}</span> — bảng chi phí (CÓ LƯƠNG) sẽ ghi vào đây.</>
          ) : (
            <>💡 File RIÊNG chỉ admin/owner mở được (bảng xuất có LƯƠNG). Xuất chạy bằng chính
              tài khoản Google của người bấm — người đó cần quyền <b>Edit</b> trên sheet.
              Rỗng = tắt nút Xuất.</>
          )}
        </p>

        <div className="field">
          <span>Webhook Discord — báo cáo task hằng ngày</span>
          <div className="row" style={{ gap: '0.5rem', alignItems: 'stretch' }}>
            <input
              className="input"
              style={{ flex: 1 }}
              value={dailyWebhook}
              onChange={(e) => setDailyWebhook(e.target.value)}
              placeholder="https://discord.com/api/webhooks/…"
            />
            {/* Gửi thử chỉ khi đang SỬA project (cần id để build report). Tạo mới thì lưu trước. */}
            {isEdit && (
              <button
                type="button"
                className="btn-sm"
                onClick={handleTest}
                disabled={testing || webhookInvalid || !dailyWebhook.trim()}
                title="Gửi thử báo cáo của project này vào webhook trên"
              >
                {testing ? 'Đang gửi…' : '🧪 Gửi thử'}
              </button>
            )}
          </div>
        </div>
        <p className="muted" style={{ fontSize: '0.78rem', marginBottom: '0.75rem' }}>
          {testMsg ? (
            <span>{testMsg}</span>
          ) : webhookInvalid ? (
            <span className="error-text">⚠ Link webhook không đúng dạng (phải chứa /api/webhooks/).</span>
          ) : dailyWebhook.trim() ? (
            <>✅ 10:30 mỗi ngày làm việc, bot gửi task của project này vào kênh webhook, tag người theo Discord ID.{isEdit && ' Bấm “Gửi thử” để xem trước ngay.'}</>
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
