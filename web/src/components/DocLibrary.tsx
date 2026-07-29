import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useProjectDocs } from '../hooks/useProjectDocs';
import { deleteProjectDoc } from '../lib/projectDocWrites';
import { hostOf, providerMeta } from '../lib/attachments';
import { foldDiacritics } from '../lib/text';
import { formatDate } from '../lib/format';
import ProviderIcon from './task/ProviderIcon';
import ConfirmDialog from './ConfirmDialog';
import DocEditModal from './doc/DocEditModal';
import type { ProjectDoc } from '../types';

/** Chip "Tất cả" của bộ lọc nhóm — không phải một nhóm thật. */
const ALL = '__all__';

/**
 * Tab **Tài liệu**: thư viện link tài liệu của dự án (`project_docs`).
 *
 * Đây là nơi curate danh sách; gắn vào task/feature thì bấm "📚 Thư viện" trong ô Tài liệu
 * của TaskModal/FeatureModal (DocPickerModal đọc cùng hook này).
 */
export default function DocLibrary() {
  const { user, isAdmin } = useAuth();
  const { selectedProjectId, selectedProject, members } = useSprintContext();
  const { docs, loading } = useProjectDocs(selectedProjectId);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string>(ALL);
  const [editing, setEditing] = useState<ProjectDoc | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDel, setConfirmDel] = useState<ProjectDoc | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  /** Sửa/xoá được khi: admin, hoặc chính người đã thêm (khớp RLS 0066). */
  const canEdit = (d: ProjectDoc) => isAdmin || d.createdBy === user?.uid;

  function copy(d: ProjectDoc) {
    void navigator.clipboard?.writeText(d.url);
    setCopiedId(d.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function handleDelete() {
    if (!confirmDel) return;
    try {
      await deleteProjectDoc(confirmDel.id);
      setConfirmDel(null);
    } catch (err) {
      console.error('Xoá tài liệu thất bại', err);
    }
  }

  if (!selectedProjectId) {
    return <div className="glass empty">Hãy chọn một dự án trước.</div>;
  }

  return (
    <div className="fade-in">
      <div className="view-header row between">
        <div>
          <h1>📚 Tài liệu</h1>
          <p>
            {docs.length} tài liệu · {selectedProject?.name ?? 'dự án'} — gắn vào task/feature
            bằng nút “📚 Thư viện” ở ô Tài liệu.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>＋ Thêm tài liệu</button>
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
        <div className="doclib-grid">
          {shown.map((d) => {
            const meta = providerMeta(d.provider);
            const host = hostOf(d.url);
            return (
              <div key={d.id} className="doclib-card glass">
                <a className="doclib-main" href={d.url} target="_blank" rel="noreferrer" title={d.url}>
                  <span className="doclib-icon" aria-hidden><ProviderIcon provider={d.provider} size={22} /></span>
                  <span className="doclib-text">
                    <span className="doclib-name">{d.name}</span>
                    <span className="doclib-sub">{meta.label}{host && host !== meta.label ? ` · ${host}` : ''}</span>
                  </span>
                </a>
                {d.description && <p className="doclib-desc">{d.description}</p>}
                <div className="doclib-foot">
                  {d.category && <span className="doclib-cat">{d.category}</span>}
                  <span className="doclib-by muted">
                    {nameOf(d.createdBy)} · {formatDate(d.createdAt)}
                  </span>
                  <span className="doclib-spacer" />
                  <button className="btn-sm" onClick={() => copy(d)} title="Sao chép link">
                    {copiedId === d.id ? '✓' : '⧉'}
                  </button>
                  {canEdit(d) && (
                    <>
                      <button className="btn-sm" onClick={() => setEditing(d)} title="Sửa">✏️</button>
                      <button className="btn-sm btn-danger" onClick={() => setConfirmDel(d)} title="Xoá">🗑</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
