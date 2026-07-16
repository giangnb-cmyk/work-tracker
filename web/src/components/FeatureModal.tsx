import { useState } from 'react';
import { createFeature, updateFeature, type FeatureInput } from '../lib/featureWrites';
import { useAuth } from '../contexts/AuthContext';
import AttachmentsField from './task/AttachmentsField';
import RefImagesSection from './task/RefImagesSection';
import type { Attachment, Feature } from '../types';

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
  // Cùng mảng `attachments` với task (phân biệt bằng `kind`), nên dùng lại nguyên
  // AttachmentsField (link) + RefImagesSection (ảnh) của TaskModal.
  const [attachments, setAttachments] = useState<Attachment[]>(feature?.attachments ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          name: name.trim(), icon, description: description.trim(), attachments,
        });
      } else {
        const input: FeatureInput = {
          projectId, name, icon, color: feature?.color ?? '#6366f1', description, attachments,
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
