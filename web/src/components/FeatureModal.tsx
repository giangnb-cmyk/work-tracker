import { useState } from 'react';
import { createFeature, updateFeature, type FeatureInput } from '../lib/featureWrites';
import { useAuth } from '../contexts/AuthContext';
import type { Feature } from '../types';

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
        await updateFeature(feature.id, { name: name.trim(), icon, description: description.trim() });
      } else {
        const input: FeatureInput = { projectId, name, icon, color: feature?.color ?? '#6366f1', description };
        await createFeature(input, user?.uid ?? '');
      }
      onClose();
    } catch (err) {
      console.error('Save feature failed', err);
      setError('Lưu thất bại. Cần quyền admin.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
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
