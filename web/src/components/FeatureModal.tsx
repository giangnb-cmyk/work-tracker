import { useCallback, useMemo, useState } from 'react';
import { createFeature, updateFeature, type FeatureInput } from '../lib/featureWrites';
import { createFeatureLabel } from '../lib/featureLabelWrites';
import { useFeatureLabels } from '../hooks/useFeatureLabels';
import { usePasteAttachment } from '../hooks/usePasteAttachment';
import { sortFeatureLabels } from '../lib/featureLabelSort';
import { formatDate } from '../lib/format';
import { useAuth } from '../contexts/AuthContext';
import AttachmentsField from './task/AttachmentsField';
import RefImagesSection from './task/RefImagesSection';
import LabelSelect from './LabelSelect';
import { labelGroup } from '../lib/bugLabelGroups';
import {
  FEATURE_KINDS,
  FEATURE_KIND_HINT,
  FEATURE_KIND_ICON,
  FEATURE_KIND_LABEL,
  type Attachment,
  type Feature,
  type FeatureKind,
} from '../types';

/** Màu gán tự động cho nhãn mới, xoay vòng theo số nhãn hiện có; version luôn xám. */
const LABEL_COLORS = ['#6366f1', '#38bdf8', '#fbbf24', '#22c55e', '#f472b6', '#a78bfa', '#fb923c', '#10b981'];

interface FeatureModalProps {
  feature?: Feature | null; // null = create
  projectId: string; // owning project (create)
  onClose: () => void;
}

/** Admin dialog to create/edit a feature within a project. */
export default function FeatureModal({ feature, projectId, onClose }: FeatureModalProps) {
  const { user } = useAuth();
  const isEdit = Boolean(feature);
  const [name, setName] = useState(feature?.name ?? '');
  const [icon, setIcon] = useState(feature?.icon ?? '🧩');
  const [description, setDescription] = useState(feature?.description ?? '');
  const [kind, setKind] = useState<FeatureKind>(feature?.kind ?? 'delivery');
  const [labelIds, setLabelIds] = useState<string[]>(feature?.labelIds ?? []);
  const [newLabel, setNewLabel] = useState('');
  /** Đánh dấu tay đã xong (0031). `wasDone` để chỉ gửi khi ĐỔI — xem FeaturePatch. */
  const wasDone = Boolean(feature?.doneAt);
  const [done, setDone] = useState(wasDone);
  // Cùng mảng `attachments` với task (phân biệt bằng `kind`), nên dùng lại nguyên
  // AttachmentsField (link) + RefImagesSection (ảnh) của TaskModal.
  const [attachments, setAttachments] = useState<Attachment[]>(feature?.attachments ?? []);
  const [saving, setSaving] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { labels } = useFeatureLabels(projectId);
  const sortedLabels = useMemo(() => sortFeatureLabels(labels), [labels]);
  // Hai dropdown: nhãn nhóm (Shop, IAP…) và version. Version LÀ nhãn, chỉ tách ra cho
  // khỏi phải dò '1.2.x' giữa cả rổ — cùng cách tab Bugs/Features tách facet version.
  const groupLabels = useMemo(() => sortedLabels.filter((l) => labelGroup(l.name) !== 'version'), [sortedLabels]);
  const versionLabels = useMemo(() => sortedLabels.filter((l) => labelGroup(l.name) === 'version'), [sortedLabels]);

  /**
   * Lưu theo đúng thứ tự hiển thị (nhãn nhóm trước, version sau) để chip trên card đọc
   * nhất quán — thứ tự bấm chọn không nên quyết định thứ tự chip.
   *
   * Nhãn chưa tra được xếp bét bằng một số HỮU HẠN, không phải Infinity: lúc `labels`
   * chưa tải xong thì mọi id đều chưa tra được, mà Infinity - Infinity = NaN và sort với
   * comparator NaN là hành vi không xác định. Sort ổn định nên chúng giữ nguyên thứ tự cũ.
   */
  const orderedLabelIds = useMemo(() => {
    const rank = new Map(sortedLabels.map((l, i) => [l.id, i]));
    const rankOf = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
    return [...labelIds].sort((a, b) => rankOf(a) - rankOf(b));
  }, [labelIds, sortedLabels]);

  function toggleLabel(id: string) {
    setLabelIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  // Dạng hàm -> callback ổn định -> usePasteAttachment không gắn lại listener mỗi render.
  const addAttachment = useCallback((att: Attachment) => setAttachments((prev) => [...prev, att]), []);
  const showError = useCallback((msg: string) => setError(msg), []);
  usePasteAttachment({ disabled: saving, onAdd: addAttachment, onError: showError, onBusy: setPasting });

  /** Tạo nhãn mới ngay trong modal và gắn luôn vào feature đang sửa. */
  async function addLabel() {
    const nm = newLabel.trim();
    if (!nm || saving) return;
    if (labels.some((l) => l.name.toLowerCase() === nm.toLowerCase())) {
      setError('Nhãn này đã có — bấm vào chip để gắn.');
      return;
    }
    setError(null);
    try {
      const color = labelGroup(nm) === 'version'
        ? '#94a3b8'
        : LABEL_COLORS[labels.length % LABEL_COLORS.length];
      const id = await createFeatureLabel({ projectId, name: nm, color, icon: '' }, user?.uid ?? '');
      setLabelIds((ids) => [...ids, id]);
      setNewLabel('');
    } catch (err) {
      console.error('Tạo nhãn thất bại', err);
      setError('Tạo nhãn thất bại. Cần quyền admin (và migration 0026 đã áp).');
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Cần nhập tên feature.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit && feature) {
        await updateFeature(feature.id, {
          name: name.trim(), icon, description: description.trim(), kind, labelIds: orderedLabelIds, attachments,
          // Chỉ gửi khi ĐỔI: gửi done:true mỗi lần lưu là dập mốc cũ thành hiện tại.
          ...(done !== wasDone ? { done } : {}),
        });
      } else {
        const input: FeatureInput = {
          projectId, name, icon, color: feature?.color ?? '#6366f1', description, kind,
          labelIds: orderedLabelIds, attachments, done,
        };
        await createFeature(input, user?.uid ?? '');
      }
      onClose();
    } catch (err) {
      console.error('Lưu feature thất bại', err);
      setError('Lưu thất bại. Cần quyền admin.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide feat-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? 'Sửa feature' : 'Feature mới'}</h2>

        <div className="grid-2">
          <label className="field">
            <span>Icon</span>
            <input className="input" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={2} />
          </label>
          <label className="field">
            <span>Tên feature *</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
        </div>

        <label className="field">
          <span>Mô tả</span>
          <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <div className="field">
          <span>Loại</span>
          {/* Mô tả nằm ở tooltip, không nhét vào nút: nhồi cả câu vào ô chọn thì ba nút
              chen nhau, chữ bé, đọc mệt hơn là không có. */}
          <div className="fk-pills">
            {FEATURE_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={`fk-pill${kind === k ? ' on' : ''}`}
                onClick={() => setKind(k)}
                title={FEATURE_KIND_HINT[k]}
              >
                {FEATURE_KIND_ICON[k]} {FEATURE_KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <p className="fk-hint">{FEATURE_KIND_HINT[kind]}</p>
        </div>

        {/* Ghi đè tay: feature ship từ trước khi có tracker thì không có task để suy ra.
            'ongoing' theo định nghĩa không bao giờ xong nên không cho tick — hiện ra mà
            bấm không ăn còn khó hiểu hơn là ẩn đi. */}
        {kind !== 'ongoing' && (
          <label className="field feat-donebox">
            <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} disabled={saving} />
            <span>
              Đã hoàn thành
              <small>
                {wasDone && feature?.doneAt
                  ? `Đánh dấu xong ${formatDate(feature.doneAt)}.`
                  : 'Tick nếu feature đã xong nhưng không có task nào để tính (import từ dự án chạy trước đó).'}
              </small>
            </span>
          </label>
        )}

        <div className="grid-2">
          <div className="field">
            <span>Nhãn — nhóm (Shop, Gameplay…)</span>
            <LabelSelect
              options={groupLabels}
              selectedIds={labelIds}
              onToggle={toggleLabel}
              placeholder="Chọn nhãn…"
              emptyHint="Chưa có nhãn nhóm nào — thêm ở ô bên dưới."
              disabled={saving}
            />
          </div>
          <div className="field">
            <span>Version delivery</span>
            <LabelSelect
              options={versionLabels}
              selectedIds={labelIds}
              onToggle={toggleLabel}
              placeholder="Chọn version…"
              emptyHint="Chưa có version nào — thêm ở ô bên dưới (vd: 1.2.x)."
              disabled={saving}
            />
          </div>
        </div>

        <div className="field">
          <div className="feat-label-new">
            <input
              className="input"
              placeholder="Thêm nhãn mới… (vd: Shop, 1.2.x)"
              value={newLabel}
              maxLength={40}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addLabel(); } }}
            />
            <button type="button" className="btn-sm" onClick={() => void addLabel()} disabled={!newLabel.trim()}>
              ＋ Nhãn
            </button>
          </div>
        </div>

        <div className="field">
          <AttachmentsField attachments={attachments} onChange={setAttachments} disabled={saving} />
        </div>
        <RefImagesSection attachments={attachments} onChange={setAttachments} disabled={saving} />
        <p className="perf-hint" style={{ marginTop: '0.75rem' }}>
          {pasting
            ? 'Đang tải ảnh vừa dán lên…'
            : 'Ctrl+V để dán thẳng ảnh hoặc link vào đây. Mọi task thuộc feature này sẽ tự thấy các link và ảnh ở trên.'}
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
