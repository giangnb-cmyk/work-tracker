import { useEffect, useState } from 'react';
import {
  createProject,
  extractChannelId,
  extractSheetId,
  updateProject,
  type ProjectInput,
} from '../lib/projectWrites';
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
  const [bugForumInput, setBugForumInput] = useState(project?.bugForumChannelId ?? '');
  const [bugNotifyRole, setBugNotifyRole] = useState(project?.bugNotifyRole ?? '');

  const sheetId = extractSheetId(sheetInput);
  const sheetInvalid = sheetInput.trim().length > 0 && !sheetId;
  const costSheetId = extractSheetId(costSheetInput);
  const costSheetInvalid = costSheetInput.trim().length > 0 && !costSheetId;
  const bugForumId = extractChannelId(bugForumInput);
  const bugForumInvalid = bugForumInput.trim().length > 0 && !bugForumId;
  /**
   * Webhook chỉ để GỬI THỬ — cố ý KHÔNG lưu vào project.
   *
   * Muốn xem thử báo cáo mà phải gõ đè lên ô webhook thật rồi nhớ hoàn nguyên là kiểu rất
   * dễ lỡ tay bấm Lưu, thế là kênh chính của cả đội chuyển sang kênh nháp. Tách hẳn một ô
   * riêng: bỏ trống thì gửi vào webhook chính, điền thì gửi vào đúng cái vừa dán.
   */
  const [testWebhook, setTestWebhook] = useState('');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  // Kiểm tra nhẹ: webhook Discord luôn chứa '/api/webhooks/'. Rỗng = tắt (không gửi).
  const isWebhookUrl = (v: string) => v.includes('/api/webhooks/');
  const webhookInvalid = dailyWebhook.trim().length > 0 && !isWebhookUrl(dailyWebhook);
  const usingTestHook = testWebhook.trim().length > 0;
  const testTarget = usingTestHook ? testWebhook.trim() : dailyWebhook.trim();
  const testTargetInvalid = testTarget.length > 0 && !isWebhookUrl(testTarget);
  const canTest = isEdit && testTarget.length > 0 && !testTargetInvalid;

  /** Gọi Edge Function daily-report ở chế độ TEST cho ĐÚNG project này -> gửi report thử
   *  (nhãn 🧪) vào webhook đích. Chỉ edit mode (cần project.id) + đã có admin JWT. */
  async function handleTest() {
    if (!project) return;
    if (!canTest) {
      setTestMsg('⚠ Nhập webhook hợp lệ trước khi gửi thử.');
      return;
    }
    setTesting(true);
    setTestMsg(null);
    const where = usingTestHook ? 'webhook thử' : 'webhook chính';
    try {
      const { data, error } = await supabase.functions.invoke('daily-report', {
        body: { projectId: project.id, webhook: testTarget },
      });
      if (error) throw error;
      if (data?.ok) {
        setTestMsg(
          data.sent > 0
            ? `✅ Đã gửi ${data.sent} tin vào ${where} — mở kênh Discord xem thử.`
            : `⚠ Gửi xong nhưng ${where} trả lỗi — kiểm tra lại URL.`,
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
    if (bugForumInvalid) {
      setError('Kênh forum bug không hợp lệ. Dán link kênh Discord, hoặc id kênh (17–20 chữ số).');
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
      bugForumChannelId: bugForumId,
      // Xoá forum thì xoá luôn role: ô role bị khoá lúc đó, để lại giá trị cũ là dữ liệu mồ
      // côi — lần sau gán forum khác sẽ ping nhầm một role không ai còn nhớ đã đặt.
      bugNotifyRole: bugForumId ? bugNotifyRole.trim() || null : null,
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
          bugForumChannelId: bugForumId,
          bugNotifyRole: bugNotifyRole.trim() || null,
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

        {/* Gửi thử — ô riêng, KHÔNG lưu. Chỉ ở chế độ SỬA vì cần project.id để dựng báo cáo. */}
        <div className="field dr-test">
          <span>🧪 Gửi thử báo cáo</span>
          <div className="row" style={{ gap: '0.5rem', alignItems: 'stretch' }}>
            <input
              className="input"
              style={{ flex: 1 }}
              value={testWebhook}
              onChange={(e) => setTestWebhook(e.target.value)}
              placeholder="Webhook để thử — bỏ trống thì gửi vào webhook chính ở trên"
              disabled={!isEdit}
            />
            <button
              type="button"
              className="btn-sm"
              onClick={handleTest}
              disabled={testing || !canTest}
              title={
                isEdit
                  ? 'Gửi báo cáo của dự án này ngay bây giờ (mang nhãn 🧪 TEST)'
                  : 'Tạo dự án xong rồi mở lại để gửi thử'
              }
            >
              {testing ? 'Đang gửi…' : 'Gửi thử'}
            </button>
          </div>
          <p className="muted" style={{ fontSize: '0.78rem', marginTop: '0.4rem', marginBottom: 0 }}>
            {testMsg ? (
              <span>{testMsg}</span>
            ) : !isEdit ? (
              <>💡 Tạo dự án xong rồi mở lại để gửi thử (báo cáo cần id của dự án).</>
            ) : testTargetInvalid ? (
              <span className="error-text">⚠ Link webhook thử không đúng dạng (phải chứa /api/webhooks/).</span>
            ) : (
              <>
                Ô này <strong>không được lưu</strong> — dán webhook kênh nháp để xem thử mà không
                đụng webhook chính. Báo cáo gửi ngay lúc bấm, nội dung y hệt bản 10:30 nhưng mang
                nhãn <strong>🧪 TEST</strong>.
                {usingTestHook ? ' Đang nhắm: webhook thử.' : ' Đang nhắm: webhook chính ở trên.'}
              </>
            )}
          </p>
        </div>

        {/* Forum bug — trước 0069 cặp project ↔ forum nằm trong bot/settings.json, đổi một
            dự án là phải vào máy chạy bot sửa JSON rồi restart. Giờ nằm cùng chỗ với các
            cấu hình per-project khác. */}
        <label className="field">
          <span>Kênh Forum Discord — báo bug</span>
          <input
            className="input"
            value={bugForumInput}
            onChange={(e) => setBugForumInput(e.target.value)}
            placeholder="Dán link kênh forum: https://discord.com/channels/…, hoặc id kênh"
          />
        </label>
        <p className="muted" style={{ fontSize: '0.78rem', marginBottom: '0.75rem' }}>
          {bugForumInvalid ? (
            <span className="error-text">⚠ Không đọc được id kênh. Chuột phải kênh forum → “Sao chép đường liên kết”.</span>
          ) : bugForumId ? (
            <>✅ Kênh id: <span className="mono">{bugForumId}</span> — bot đồng bộ hai chiều:
              bài forum ↔ bug, tag forum ↔ nhãn. Bot cần quyền <b>Manage Threads</b>,{' '}
              <b>Manage Channels</b>, <b>Create Posts</b> trong kênh này.</>
          ) : (
            <>💡 Rỗng = dự án này không đồng bộ bug với Discord (nút “Sync Discord” ở tab Bug
              sẽ không có gì để chạy). Mỗi dự án một forum riêng.</>
          )}
        </p>

        <label className="field">
          <span>Role Discord được ping khi có bug mới</span>
          <input
            className="input"
            value={bugNotifyRole}
            onChange={(e) => setBugNotifyRole(e.target.value)}
            placeholder="Tên role, ví dụ: DEV M1 — hoặc id role"
            disabled={!bugForumId}
          />
        </label>
        <p className="muted" style={{ fontSize: '0.78rem', marginBottom: '0.75rem' }}>
          {!bugForumId ? (
            <>💡 Điền kênh forum ở trên trước đã.</>
          ) : bugNotifyRole.trim() ? (
            <>✅ Bug báo từ web mà <strong>chưa giao cho ai</strong> sẽ ping role này ở đầu bài.
              Bug đã có người nhận thì chỉ ping đúng người đó. Role phải bật “Allow anyone to
              @mention this role”, không thì tiếng ping câm.</>
          ) : (
            <>💡 Rỗng = không ping ai. Khớp theo tên, không phân biệt hoa/thường và dấu.</>
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
