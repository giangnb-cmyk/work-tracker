import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSprintContext } from '../../contexts/SprintContext';
import { createBug, deleteBug, fetchBugDetail, updateBug } from '../../lib/bugWrites';
import { ensureStatusLabel } from '../../lib/bugLabelWrites';
import { BUG_STATUS_COLOR, labelsForStatus } from '../../lib/bugStatus';
import { labelsInGroup, selectedInGroup, setGroupLabel, type LabelGroup } from '../../lib/bugLabelGroups';
import { openDiscordThread } from '../../lib/discordLink';
import { detectProvider, hostOf, providerMeta } from '../../lib/attachments';
import { formatDate } from '../../lib/format';
import ProviderIcon from '../task/ProviderIcon';
import Markdown from '../Markdown';
import CollapsibleBox from '../CollapsibleBox';
import ConfirmDialog from '../ConfirmDialog';
import Lightbox from '../Lightbox';
import BugLabelChip from './BugLabelChip';
import BadgeSelect from './BadgeSelect';
import SearchableSelect from '../SearchableSelect';
import { MoreVerticalIcon } from '../icons';
import { BUG_STATUSES, BUG_STATUS_LABEL, type Attachment, type Bug, type BugLabel, type BugStatus } from '../../types';

interface Props {
  bug?: Bug | null;
  projectId: string;
  labels: BugLabel[];
  defaultStatus?: BugStatus;
  onClose: () => void;
}

const URL_RE = /https?:\/\/[^\s)]+/g;

/** Bug detail: header badges · info grid (grouped tags) · media/links · footer. */
export default function BugModal({ bug, projectId, labels, defaultStatus, onClose }: Props) {
  const { user, profile, can } = useAuth();
  const { members } = useSprintContext();
  const isEdit = Boolean(bug);
  const canEdit = !isEdit || can('bug.edit_any') || bug?.reporterId === user?.uid || bug?.assigneeId === user?.uid;

  const [title, setTitle] = useState(bug?.title ?? '');
  const [description, setDescription] = useState(bug?.description ?? '');
  const [status, setStatus] = useState<BugStatus>(bug?.status ?? defaultStatus ?? 'open');
  const [assigneeId, setAssigneeId] = useState<string | null>(bug?.assigneeId ?? null);
  const [labelIds, setLabelIds] = useState<string[]>(bug?.labelIds ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bug có sẵn thì mặc định ĐỌC (Markdown đã render); bug mới thì mở thẳng ô nhập.
  const [editingDesc, setEditingDesc] = useState(!isEdit);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>(bug?.attachments ?? []);
  const [copied, setCopied] = useState(false);
  /**
   * Danh sách bug chỉ mang VỎ (BUG_SUMMARY_COLUMNS) — ruột (mô tả + đính kèm) nạp
   * riêng ở đây. Chưa nạp xong thì KHOÁ Lưu và khoá cả nút "Sửa" mô tả: lưu lúc này
   * là ghi đè mô tả thật trên server bằng chuỗi rỗng.
   */
  const [detailReady, setDetailReady] = useState(!isEdit);

  useEffect(() => {
    if (!bug) return;
    let alive = true;
    fetchBugDetail(bug.id)
      .then((d) => {
        if (!alive) return;
        setDescription(d.description);
        setAttachments(d.attachments);
        setDetailReady(true);
      })
      .catch((err) => {
        console.error('Tải chi tiết bug thất bại', err);
        if (alive) setError('Không tải được mô tả bug — đóng rồi mở lại nhé.');
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bug?.id]);

  const grp = (g: LabelGroup) => labelsInGroup(labels, g);
  const sel = (g: LabelGroup) => selectedInGroup(labelIds, labels, g);
  function setGroup(g: LabelGroup, id: string) {
    setLabelIds((ids) => setGroupLabel(ids, labels, g, id));
  }
  async function changeStatus(next: BugStatus) {
    setStatus(next);
    // Palette thiếu nhãn workflow của trạng thái đích thì tạo trước (cùng lý do move() ở
    // Bugs.tsx: thiếu nhãn thì không push, sync sau kéo bug về trạng thái cũ). Fail (non-
    // admin) thì như cũ.
    let palette = labels;
    const created = await ensureStatusLabel(projectId, next, labels, user?.uid ?? '');
    if (created) palette = [...labels, created];
    setLabelIds((ids) => labelsForStatus(ids, next, palette));
  }

  function copyLink() {
    if (!bug) return;
    // ?p= để người nhận đang đứng ở dự án khác vẫn nhảy đúng — số bug đếm theo dự án.
    void navigator.clipboard.writeText(`${window.location.origin}/bugs/${bug.number}?p=${projectId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const otherLabels = grp('other');
  const links = useMemo(() => {
    const found = (description.match(URL_RE) ?? []).map((u) => u.replace(/[.,]+$/, ''));
    return [...new Set(found)];
  }, [description]);
  const images = attachments.filter((a) => a.kind === 'image');

  async function handleSave() {
    if (!title.trim()) return setError('Cần nhập tiêu đề bug.');
    if (isEdit && !detailReady) return; // nút đã disable — chốt chặn thêm cho chắc

    setSaving(true);
    setError(null);
    const assignee = members.find((m) => m.uid === assigneeId) ?? null;
    try {
      if (isEdit && bug) {
        const labelsChanged = [...labelIds].sort().join() !== [...(bug.labelIds ?? [])].sort().join();
        await updateBug(bug.id, {
          title: title.trim(), description: description.trim(), status, labelIds,
          assigneeId, assigneeName: assignee?.displayName ?? '',
          ...(bug.discordThreadId && labelsChanged ? { pendingDiscordPush: true } : {}),
        });
      } else {
        await createBug({
          projectId, title, description, status, labelIds,
          assigneeId, assigneeName: assignee?.displayName ?? '',
          reporterId: user?.uid ?? null, reporterName: profile?.displayName ?? '',
        });
      }
      onClose();
    } catch (err) {
      console.error('Lưu bug thất bại', err);
      setError('Lưu thất bại. Kiểm tra quyền hoặc kết nối.');
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!bug) return;
    try {
      await deleteBug(bug.id);
      onClose();
    } catch {
      setConfirmDelete(false);
      setError('Xoá thất bại.');
    }
  }

  const sevOpts = grp('severity').map((l) => ({ value: l.id, label: l.name, color: l.color, icon: l.icon }));
  const statusOpts = BUG_STATUSES.map((s) => ({ value: s, label: BUG_STATUS_LABEL[s], color: BUG_STATUS_COLOR[s] }));

  // Nhãn cho ô chọn: icon emoji đứng trước tên. Icon dạng URL (nhãn Discord dùng ảnh
  // custom emoji) thì bỏ — gõ tìm là gõ theo TÊN, nhét URL vào chuỗi tìm kiếm chỉ tổ nhiễu.
  const optLabel = (l: BugLabel) => `${l.icon && !l.icon.startsWith('http') ? `${l.icon} ` : ''}${l.name}`;

  /**
   * Ô chọn nhóm nhãn (Version / Loại / Nền tảng) — SearchableSelect để gõ tìm được, giống
   * chi tiết task: danh sách version dài hàng chục dòng, cuộn tay tìm '1.1.1.37' thì cực.
   *
   * `panel="overlay"` là BẮT BUỘC ở đây: `.bugf` là hàng flex cao cố định 44px, panel
   * in-flow (mặc định) sẽ nong ô ra và xô lệch cả lưới thông tin khi mở.
   */
  const groupSelect = (g: LabelGroup) => (
    <div className="bugf-ss">
      <SearchableSelect
        value={sel(g)}
        onChange={(v) => setGroup(g, v)}
        options={grp(g).map((l) => ({ value: l.id, label: optLabel(l) }))}
        disabled={!canEdit}
        allowEmpty
        emptyLabel="— Không —"
        placeholder="— Không —"
        panel="overlay"
      />
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal bug-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header: icon · #num · severity · status · link · close */}
        <div className="bugm-head">
          <span className="bugm-icon" aria-hidden>🐞</span>
          {isEdit && bug && <span className="bug-num mono">#{bug.number}</span>}
          <BadgeSelect value={sel('severity')} options={sevOpts} onChange={(v) => setGroup('severity', v)} disabled={!canEdit} placeholder="Mức độ" />
          <BadgeSelect value={status} options={statusOpts} onChange={(v) => changeStatus(v as BugStatus)} disabled={!canEdit} placeholder="Trạng thái" />
          <span className="bugm-head-spacer" />
          {isEdit && bug && (
            <button type="button" className="bugm-iconbtn" title={copied ? 'Đã chép link' : 'Chép link bug này'} onClick={copyLink}>
              {copied ? '✓' : '🔗'}
            </button>
          )}
          {bug?.discordThreadId && bug?.discordGuildId && (
            <button type="button" className="bugm-iconbtn bugm-discord" title="Mở thread trong Discord" onClick={() => openDiscordThread(bug.discordGuildId!, bug.discordThreadId!)}>
              <ProviderIcon provider="discord" size={18} />
            </button>
          )}
          <button className="tmodal-x" onClick={onClose} aria-label="Đóng">✕</button>
        </div>

        <div className="bugm-scroll">
          <input
            className="bug-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canEdit}
            placeholder="Tiêu đề bug (vd: [1.1.1.37i] [Piggy Bank] …)"
          />
          {isEdit && bug && (
            <p className="bug-meta muted">📄 Tạo {formatDate(bug.createdAt)} bởi {bug.reporterName || '—'} {bug.discordThreadId ? '💬' : ''}</p>
          )}

          {/* Quick chips: category · platform · version */}
          {(sel('category') || sel('platform') || sel('version')) && (
            <div className="bugm-quick">
              {(['category', 'platform', 'version'] as LabelGroup[]).map((g) => {
                const id = sel(g);
                const l = labels.find((x) => x.id === id);
                return l ? <BugLabelChip key={g} label={l} /> : null;
              })}
            </div>
          )}

          {/* Mô tả — đọc dạng Markdown, bấm "Sửa" để về ô nhập thô */}
          <section className="bugm-section">
            <div className="bugm-sec-head">
              <h4 className="tm-h">📝 Mô tả</h4>
              {canEdit && (
                <div className="seg-toggle seg-sm" role="group" aria-label="Kiểu xem mô tả">
                  <button type="button" className={`seg${!editingDesc ? ' on' : ''}`} onClick={() => setEditingDesc(false)}>Xem</button>
                  <button type="button" className={`seg${editingDesc ? ' on' : ''}`} onClick={() => setEditingDesc(true)} disabled={!detailReady}>Sửa</button>
                </div>
              )}
            </div>
            {canEdit && editingDesc ? (
              <textarea
                className="textarea bugm-desc-edit"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Các bước tái hiện, kết quả mong đợi / thực tế… (hỗ trợ Markdown)"
              />
            ) : description.trim() ? (
              <CollapsibleBox className="bugm-desc-clp">
                <Markdown className="bugm-desc-view">{description}</Markdown>
              </CollapsibleBox>
            ) : !detailReady ? (
              <p className="muted bugm-desc-empty">Đang tải mô tả…</p>
            ) : (
              <p className="muted bugm-desc-empty">Chưa có mô tả.</p>
            )}
          </section>

          {/* Thông tin */}
          <section className="bugm-section">
            <h4 className="tm-h">📋 Thông tin</h4>
            {/* Mỗi ô là <div> chứ không phải <label>: SearchableSelect render ra <button>,
                mà button LÀ phần tử gắn nhãn được — bọc trong <label> thì bấm vào chỗ trống
                của ô cũng kích hoạt nút, mở/đóng panel loạn xạ. */}
            <div className="bug-info">
              <div className="bugf"><span className="bugf-ic">🏷️</span><span className="bugf-lb">Version</span>{groupSelect('version')}</div>
              <div className="bugf">
                <span className="bugf-ic">🚀</span><span className="bugf-lb">Trạng thái</span>
                <div className="bugf-ss">
                  <SearchableSelect
                    value={status}
                    onChange={(v) => void changeStatus(v as BugStatus)}
                    options={BUG_STATUSES.map((s) => ({ value: s, label: BUG_STATUS_LABEL[s] }))}
                    disabled={!canEdit}
                    panel="overlay"
                  />
                </div>
              </div>
              <div className="bugf">
                <span className="bugf-ic">🙋</span><span className="bugf-lb">Người nhận</span>
                <div className="bugf-ss">
                  <SearchableSelect
                    value={assigneeId ?? ''}
                    onChange={(v) => setAssigneeId(v || null)}
                    options={members.map((m) => ({ value: m.uid, label: m.displayName }))}
                    disabled={!canEdit}
                    allowEmpty
                    emptyLabel="Chưa giao"
                    placeholder="Chưa giao"
                    panel="overlay"
                  />
                </div>
              </div>
              <div className="bugf"><span className="bugf-ic">🐞</span><span className="bugf-lb">Loại</span>{groupSelect('category')}</div>
              <div className="bugf"><span className="bugf-ic">📱</span><span className="bugf-lb">Nền tảng</span>{groupSelect('platform')}</div>
            </div>
            {otherLabels.length > 0 && (
              <div className="bugm-others">
                {otherLabels.map((l) => (
                  <BugLabelChip key={l.id} label={l} active={labelIds.includes(l.id)}
                    onClick={canEdit ? () => setLabelIds((ids) => ids.includes(l.id) ? ids.filter((x) => x !== l.id) : [...ids, l.id]) : undefined} />
                ))}
              </div>
            )}
          </section>

          {/* Tài liệu & liên kết */}
          {(images.length > 0 || links.length > 0 || bug?.discordThreadId) && (
            <section className="bugm-section">
              <h4 className="tm-h">📎 Tài liệu & liên kết</h4>
              {images.length > 0 && (
                <div className="bug-media">
                  {images.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="bug-media-item"
                      onClick={() => setPreview(a)}
                      title={`Xem ảnh: ${a.name}`}
                    >
                      <img src={a.url} alt={a.name} loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
              <div className="doc-list">
                {bug?.discordThreadId && bug?.discordGuildId && (
                  <button type="button" className="doc-card doc-card-btn" onClick={() => openDiscordThread(bug.discordGuildId!, bug.discordThreadId!)}>
                    <span className="doc-icon"><ProviderIcon provider="discord" size={20} /></span>
                    <span className="doc-text"><span className="doc-name">Thread trên Discord</span><span className="doc-sub">Mở app / web · xem cả video</span></span>
                    <MoreVerticalIcon size={16} />
                  </button>
                )}
                {links.map((url, i) => {
                  const prov = detectProvider(url);
                  return (
                    <a key={`${url}-${i}`} className="doc-card" href={url} target="_blank" rel="noreferrer" title={url}>
                      <span className="doc-icon"><ProviderIcon provider={prov} size={20} /></span>
                      <span className="doc-text"><span className="doc-name">{providerMeta(prov).label}</span><span className="doc-sub">{hostOf(url)}</span></span>
                      <MoreVerticalIcon size={16} />
                    </a>
                  );
                })}
              </div>
            </section>
          )}

          {error && <p className="error-text">{error}</p>}
        </div>

        {/* Footer */}
        <div className="bugm-footer">
          {isEdit && (can('bug.delete') || bug?.reporterId === user?.uid) && (
            <button className="btn-sm btn-danger" onClick={() => setConfirmDelete(true)}>🗑 Xoá</button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn-sm" onClick={onClose}>Huỷ</button>
          {canEdit && (
            <button className="btn-primary" onClick={handleSave} disabled={saving || (isEdit && !detailReady)}>
              {saving ? 'Đang lưu…' : isEdit ? 'Lưu thay đổi' : 'Tạo bug'}
            </button>
          )}
        </div>
      </div>

      {preview && (
        <Lightbox url={preview.url} name={preview.name} onClose={() => setPreview(null)} />
      )}

      {confirmDelete && bug && (
        <ConfirmDialog
          title="Xoá bug?"
          message={<>Bug <strong>#{bug.number} “{bug.title}”</strong> sẽ bị xoá khỏi app.</>}
          detail={
            bug.discordThreadId
              ? 'Bài post trên Discord KHÔNG bị xoá — và vì forum vẫn còn bài đó, lần sync tới bot sẽ tạo lại bug này. Muốn dứt điểm thì xoá bài trên Discord trước.'
              : 'Không khôi phục được.'
          }
          confirmLabel="Xoá bug"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
