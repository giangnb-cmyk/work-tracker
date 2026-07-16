import { useMemo, useState } from 'react';
import { createFeature, updateFeature, type FeatureInput } from '../lib/featureWrites';
import { createFeatureLabel } from '../lib/featureLabelWrites';
import { useFeatureLabels } from '../hooks/useFeatureLabels';
import { sortFeatureLabels } from '../lib/featureLabelSort';
import { useAuth } from '../contexts/AuthContext';
import AttachmentsField from './task/AttachmentsField';
import RefImagesSection from './task/RefImagesSection';
import BugLabelChip from './bug/BugLabelChip';
import { labelGroup } from '../lib/bugLabelGroups';
import type { Attachment, Feature, FeatureKind } from '../types';

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
  // Cùng mảng `attachments` với task (phân biệt bằng `kind`), nên dùng lại nguyên
  // AttachmentsField (link) + RefImagesSection (ảnh) của TaskModal.
  const [attachments, setAttachments] = useState<Attachment[]>(feature?.attachments ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { labels } = useFeatureLabels(projectId);
  const sortedLabels = useMemo(() => sortFeatureLabels(labels), [labels]);

  function toggleLabel(id: string) {
    setLabelIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

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
          name: name.trim(), icon, description: description.trim(), kind, labelIds, attachments,
        });
      } else {
        const input: FeatureInput = {
          projectId, name, icon, color: feature?.color ?? '#6366f1', description, kind, labelIds, attachments,
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
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
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
          <div className="fk-pills">
            <button
              type="button"
              className={`fk-pill${kind === 'delivery' ? ' on' : ''}`}
              onClick={() => setKind('delivery')}
            >
              🎯 Gói bán <small>ship cho user, có ngày xong</small>
            </button>
            <button
              type="button"
              className={`fk-pill${kind === 'ongoing' ? ' on' : ''}`}
              onClick={() => setKind('ongoing')}
            >
              🔁 Liên tục <small>polish/tuning, không có “done”</small>
            </button>
          </div>
        </div>

        <div className="field">
          <span>Nhãn — nhóm (Shop, Gameplay…) + version delivery (1.2.0)</span>
          {sortedLabels.length > 0 && (
            <div className="feat-chip-row">
              {sortedLabels.map((l) => (
                <BugLabelChip key={l.id} label={l} active={labelIds.includes(l.id)} onClick={() => toggleLabel(l.id)} />
              ))}
            </div>
          )}
          <div className="feat-label-new">
            <input
              className="input"
              placeholder="Thêm nhãn mới… (vd: Shop, 1.2.0)"
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

        <AttachmentsField attachments={attachments} onChange={setAttachments} disabled={saving} />
        <RefImagesSection attachments={attachments} onChange={setAttachments} disabled={saving} />
        <p className="perf-hint" style={{ marginTop: '0.75rem' }}>
          Mọi task thuộc feature này sẽ tự thấy các link và ảnh ở trên.
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
