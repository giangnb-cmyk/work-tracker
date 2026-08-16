import { useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  createProjectDoc,
  DuplicateDocError,
  updateProjectDoc,
} from '../../lib/projectDocWrites';
import SearchableSelect from '../SearchableSelect';
import type { ProjectDoc } from '../../types';

interface Props {
  projectId: string;
  /** null = thêm mới. */
  doc: ProjectDoc | null;
  /** Nhóm đã có trong dự án — gợi ý để mọi người gõ trùng nhau thay vì mỗi người một kiểu. */
  categories: string[];
  onClose: () => void;
}

/** Thêm/sửa một mục trong thư viện tài liệu của dự án. */
export default function DocEditModal({ projectId, doc, categories, onClose }: Props) {
  const { user } = useAuth();
  const isEdit = Boolean(doc);
  const [url, setUrl] = useState(doc?.url ?? '');
  const [name, setName] = useState(doc?.name ?? '');
  const [category, setCategory] = useState(doc?.category ?? '');
  const [description, setDescription] = useState(doc?.description ?? '');
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Option cho dropdown Nhóm = nhóm đã có TRONG dự án + nhóm đang chọn.
   *
   * Phải cộng thêm `category`: nhóm vừa gõ mới chưa có trong `categories` (danh sách đó rút
   * từ các tài liệu ĐÃ lưu), mà SearchableSelect không khớp được value nào thì nó hiện
   * placeholder — người dùng gõ nhóm mới xong lại thấy ô trống như chưa chọn gì.
   */
  const catOptions = useMemo(() => {
    const set = new Set(categories.map((c) => c.trim()).filter(Boolean));
    if (category.trim()) set.add(category.trim());
    return [...set].sort((a, b) => a.localeCompare(b, 'vi')).map((c) => ({ value: c, label: c }));
  }, [categories, category]);

  function addCategory() {
    const c = newCategory.trim();
    if (!c) return;
    setCategory(c);
    setNewCategory('');
  }

  // Cùng luật với CHECK ở DB (url ~* '^https?://') — báo tại đây cho người dùng hiểu, chứ
  // đừng để họ nhận một lỗi Postgres thô.
  const urlInvalid = url.trim().length > 0 && !/^https?:\/\//i.test(url.trim());

  async function handleSave() {
    if (!url.trim()) return setError('Cần dán link tài liệu.');
    if (urlInvalid) return setError('Link phải bắt đầu bằng http:// hoặc https://');
    setSaving(true);
    setError(null);
    const input = { url, name, category, description };
    try {
      if (isEdit && doc) await updateProjectDoc(doc.id, input);
      else await createProjectDoc(projectId, input, user?.uid ?? '');
      onClose();
    } catch (err) {
      console.error('Lưu tài liệu thất bại', err);
      setError(
        err instanceof DuplicateDocError
          ? err.message
          : 'Lưu thất bại — chỉ người thêm hoặc admin sửa được mục này.',
      );
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? 'Sửa tài liệu' : 'Thêm tài liệu vào thư viện'}</h2>

        <label className="field">
          <span>Link *</span>
          <input
            className="input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://docs.google.com/… · Figma · Notion · Drive…"
            autoFocus={!isEdit}
          />
        </label>
        {urlInvalid && <p className="error-text">⚠ Link phải bắt đầu bằng http:// hoặc https://</p>}

        <label className="field">
          <span>Tên hiển thị</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bỏ trống thì lấy tên miền của link"
            maxLength={160}
          />
        </label>

        {/* Nhóm: dropdown CỦA APP (SearchableSelect) cho nhóm đã có + một ô gõ nhóm mới —
            cùng khuôn với FeatureModal (LabelSelect + "＋ Nhãn"). Trước đây dùng
            <datalist>: trình duyệt tự vẽ, nên nó là widget native duy nhất trong app,
            lệch hẳn font và màu khỏi mọi dropdown còn lại. */}
        <div className="field">
          <span className="field-label">Nhóm</span>
          <SearchableSelect
            value={category}
            onChange={setCategory}
            options={catOptions}
            allowEmpty
            emptyLabel="— Chưa phân nhóm —"
            placeholder={catOptions.length > 0 ? 'Chọn nhóm…' : 'Chưa có nhóm nào — gõ nhóm mới ở dưới'}
            disabled={saving}
          />
        </div>
        <div className="field">
          <div className="feat-label-new">
            <input
              className="input"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
              placeholder="Nhóm mới… (VD: GDD, Art, Kỹ thuật)"
              maxLength={40}
              disabled={saving}
            />
            <button type="button" className="btn-sm" onClick={addCategory} disabled={!newCategory.trim() || saving}>
              ＋ Nhóm
            </button>
          </div>
        </div>

        <label className="field">
          <span>Ghi chú</span>
          <textarea
            className="textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tài liệu này dùng để làm gì, ai cần đọc…"
          />
        </label>

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <button className="btn-sm" onClick={onClose} disabled={saving}>Huỷ</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Đang lưu…' : isEdit ? 'Lưu' : 'Thêm vào thư viện'}
          </button>
        </div>
      </div>
    </div>
  );
}
