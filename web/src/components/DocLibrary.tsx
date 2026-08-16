import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useProjectDocs } from '../hooks/useProjectDocs';
import { useMyDocPins } from '../hooks/useMyDocPins';
import { useStoredView } from '../hooks/useStoredView';
import { deleteProjectDoc, setDocPinned } from '../lib/projectDocWrites';
import { reportError } from '../lib/errorBus';
import { foldDiacritics } from '../lib/text';
import ConfirmDialog from './ConfirmDialog';
import DocCard from './doc/DocCard';
import DocRow from './doc/DocRow';
import DocEditModal from './doc/DocEditModal';
import type { ProjectDoc } from '../types';

/** Chip "Tất cả" của bộ lọc nhóm — không phải một nhóm thật. */
const ALL = '__all__';

type ViewMode = 'card' | 'list';

const VIEW_MODES: readonly ViewMode[] = ['card', 'list'];
/** Nhớ kiểu xem qua các lần vào — sở thích cá nhân, cùng khuôn với tab Bugs/Task của tôi. */
const MODE_KEY = 'docLibView';

/**
 * Tab **Tài liệu**: thư viện link tài liệu của dự án (`project_docs`).
 *
 * Đây là nơi curate danh sách; gắn vào task/feature thì bấm "📚 Thư viện" trong ô Tài liệu
 * của TaskModal/FeatureModal (DocPickerModal đọc cùng hook này).
 */
export default function DocLibrary() {
  const { user, can } = useAuth();
  const { selectedProjectId, selectedProject, members } = useSprintContext();
  const { docs, loading } = useProjectDocs(selectedProjectId);
  const { pinnedIds } = useMyDocPins(user?.uid ?? '');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string>(ALL);
  const [editing, setEditing] = useState<ProjectDoc | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDel, setConfirmDel] = useState<ProjectDoc | null>(null);
  const [mode, selectMode] = useStoredView<ViewMode>(MODE_KEY, VIEW_MODES, 'card');

  const nameOf = useMemo(() => {
    const map = new Map(members.map((m) => [m.uid, m.displayName]));
    return (uid: string | null) => (uid ? map.get(uid) ?? 'Đã rời nhóm' : 'Hệ thống');
  }, [members]);

  // Nhóm rút ra TỪ DỮ LIỆU (category là chuỗi tự do, không có bảng palette).
  const categories = useMemo(() => {
    const set = new Set(docs.map((d) => d.category.trim()).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [docs]);

  const shown = useMemo(() => {
    const q = foldDiacritics(query.trim());
    return docs.filter((d) => {
      if (group !== ALL && d.category.trim() !== group) return false;
      if (!q) return true;
      // Tìm cả trong URL: người ta hay nhớ "cái sheet timeline" qua đường link.
      return foldDiacritics(`${d.name} ${d.description} ${d.category} ${d.url}`).includes(q);
    });
  }, [docs, query, group]);

  // Ghim tách hẳn thành KHU RIÊNG trên đầu (có divider) chứ không chỉ sắp lên trước —
  // nhìn phát biết đâu là lối tắt của mình. Bộ lọc/tìm áp cho cả hai khu như nhau.
  const pinnedDocs = useMemo(() => shown.filter((d) => pinnedIds.has(d.id)), [shown, pinnedIds]);
  const otherDocs = useMemo(() => shown.filter((d) => !pinnedIds.has(d.id)), [shown, pinnedIds]);

  async function togglePin(d: ProjectDoc) {
    const next = !pinnedIds.has(d.id);
    try {
      await setDocPinned(d.id, user?.uid ?? '', next);
    } catch (err) {
      reportError('Ghim tài liệu', err, next ? 'Không ghim được tài liệu này.' : 'Không bỏ ghim được.');
    }
  }

  /** Sửa/xoá được khi: có 'doc.manage' (bao admin), hoặc chính người đã thêm (khớp RLS 0075). */
  const canEdit = (d: ProjectDoc) => can('doc.manage') || d.createdBy === user?.uid;

  async function handleDelete() {
    if (!confirmDel) return;
    try {
      await deleteProjectDoc(confirmDel.id);
      setConfirmDel(null);
    } catch (err) {
      console.error('Xoá tài liệu thất bại', err);
    }
  }

  /** Một khối tài liệu theo kiểu xem đang chọn — dùng cho cả khu ghim lẫn phần còn lại. */
  const renderDocs = (list: ProjectDoc[]) => {
    const itemProps = (d: ProjectDoc) => ({
      doc: d,
      authorName: nameOf(d.createdBy),
      canEdit: canEdit(d),
      pinned: pinnedIds.has(d.id),
      onTogglePin: (doc: ProjectDoc) => void togglePin(doc),
      onEdit: setEditing,
      onDelete: setConfirmDel,
    });
    return mode === 'card' ? (
      <div className="doclib-grid">
        {list.map((d) => <DocCard key={d.id} {...itemProps(d)} />)}
      </div>
    ) : (
      <div className="doclib-rows glass">
        {list.map((d) => <DocRow key={d.id} {...itemProps(d)} />)}
      </div>
    );
  };

  if (!selectedProjectId) {
    return <div className="glass empty">Hãy chọn một dự án trước.</div>;
  }

  return (
    <div className="fade-in">
      <div className="view-header row between">
        <div>
          <h1>📚 Tài liệu</h1>
          <p>
            {docs.length} tài liệu
            {pinnedDocs.length > 0 && ` · ${pinnedDocs.length} bạn đã ghim`} · {selectedProject?.name ?? 'dự án'}
            {' '}— gắn vào task/feature bằng nút “📚 Thư viện” ở ô Tài liệu.
          </p>
        </div>
        <div className="row" style={{ gap: '0.6rem', alignItems: 'center' }}>
          <div className="seg-toggle" role="group" aria-label="Kiểu hiển thị">
            <button className={`seg${mode === 'card' ? ' on' : ''}`} onClick={() => selectMode('card')}>Thẻ</button>
            <button className={`seg${mode === 'list' ? ' on' : ''}`} onClick={() => selectMode('list')}>Danh sách</button>
          </div>
          <button className="btn-primary" onClick={() => setCreating(true)}>＋ Thêm tài liệu</button>
        </div>
      </div>

      <div className="doclib-bar">
        <input
          className="input doclib-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm theo tên, ghi chú, nhóm hoặc link…"
        />
        {categories.length > 0 && (
          <div className="doclib-chips">
            <button
              className={`chip${group === ALL ? ' on' : ''}`}
              onClick={() => setGroup(ALL)}
            >
              Tất cả
            </button>
            {categories.map((c) => (
              <button key={c} className={`chip${group === c ? ' on' : ''}`} onClick={() => setGroup(c)}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
      ) : shown.length === 0 ? (
        <div className="glass empty">
          {docs.length === 0
            ? 'Thư viện còn trống. Bấm “Thêm tài liệu” để dán link đầu tiên — sau đó gắn được vào task và feature.'
            : 'Không có tài liệu nào khớp bộ lọc.'}
        </div>
      ) : (
        <>
          {/* Khu ghim của TÔI đứng riêng trên đầu, divider ngăn với phần còn lại. */}
          {pinnedDocs.length > 0 && (
            <>
              <h3 className="doclib-sechead">📌 Ghim của bạn <span className="mono">{pinnedDocs.length}</span></h3>
              {renderDocs(pinnedDocs)}
              {otherDocs.length > 0 && <div className="doclib-divider" aria-hidden />}
            </>
          )}
          {otherDocs.length > 0 && renderDocs(otherDocs)}
        </>
      )}

      {(creating || editing) && (
        <DocEditModal
          projectId={selectedProjectId}
          doc={editing}
          categories={categories}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}

      {confirmDel && (
        <ConfirmDialog
          title="Xoá khỏi thư viện?"
          message={<>Tài liệu <strong>“{confirmDel.name}”</strong> sẽ bị xoá khỏi thư viện dự án.</>}
          detail="Task và feature ĐÃ gắn tài liệu này thì KHÔNG bị ảnh hưởng — lúc gắn là copy sang task, không phải trỏ tới đây."
          confirmLabel="Xoá"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}
