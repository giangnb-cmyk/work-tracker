import { useEffect, useState } from 'react';
import { createProject, updateProject, type ProjectInput } from '../lib/projectWrites';
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
    setSaving(true);
    setError(null);
    const input: ProjectInput = {
      name,
      icon,
      color: project?.color ?? '#6366f1',
      description,
      notionProjectId: notionProjectId || null,
    };
    try {
      if (isEdit && project) {
        await updateProject(project.id, {
          name: name.trim(),
          icon,
          description: description.trim(),
          notionProjectId: notionProjectId || null,
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
