import { useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useProjectDocs } from '../../hooks/useProjectDocs';
import { useMyDocPins } from '../../hooks/useMyDocPins';
import { hostOf, providerMeta } from '../../lib/attachments';
import { foldDiacritics } from '../../lib/text';
import ProviderIcon from '../task/ProviderIcon';
import type { ProjectDoc } from '../../types';

interface Props {
  projectId: string;
  /** URL đã đính sẵn — mục trùng hiện ra là "đã gắn" và không chọn lại được. */
  attachedUrls: string[];
  onPick: (docs: ProjectDoc[]) => void;
  onClose: () => void;
}

/**
 * Chọn tài liệu TỪ THƯ VIỆN dự án để đính vào task/feature. Chọn nhiều được — gắn 3 tài
 * liệu mà phải mở lại popup 3 lần thì thà đi dán link.
 */
export default function DocPickerModal({ projectId, attachedUrls, onPick, onClose }: Props) {
  const { user } = useAuth();
  const { docs, loading } = useProjectDocs(projectId);
  const { pinnedIds } = useMyDocPins(user?.uid ?? '');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // So theo URL chứ không theo id: attachment là bản COPY, id của nó khác id thư viện.
  const attached = useMemo(() => new Set(attachedUrls.map((u) => u.trim())), [attachedUrls]);

  const shown = useMemo(() => {
    const q = foldDiacritics(query.trim());
    const matched = q
      ? docs.filter((d) => foldDiacritics(`${d.name} ${d.category} ${d.description} ${d.url}`).includes(q))
      : docs;
    // Tài liệu mình đã ghim lên đầu — chính là "hay dùng", nên cũng là thứ hay gắn nhất.
    return [...matched].sort((a, b) => Number(pinnedIds.has(b.id)) - Number(pinnedIds.has(a.id)));
  }, [docs, query, pinnedIds]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirm() {
    const chosen = docs.filter((d) => picked.has(d.id));
    if (chosen.length > 0) onPick(chosen);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>📚 Gắn từ thư viện tài liệu</h2>
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm tài liệu…"
          autoFocus
        />

        {loading ? (
          <div className="center-screen" style={{ minHeight: 120 }}><div className="spinner" /></div>
        ) : shown.length === 0 ? (
          <p className="muted docpick-empty">
            {docs.length === 0
              ? 'Thư viện của dự án còn trống — thêm tài liệu ở tab 📚 Tài liệu trước.'
              : 'Không có tài liệu nào khớp.'}
          </p>
        ) : (
          <div className="docpick-list">
            {shown.map((d) => {
              const already = attached.has(d.url.trim());
              const on = picked.has(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  className={`docpick-row${on ? ' on' : ''}${already ? ' already' : ''}`}
                  onClick={() => !already && toggle(d.id)}
                  disabled={already}
                  title={already ? 'Đã gắn rồi' : d.url}
                >
                  <span className="docpick-check" aria-hidden>{already ? '✓' : on ? '☑' : '☐'}</span>
                  {/* Cùng class với AttachmentCard/DocCard — một link tài liệu phải nhìn
                      y hệt nhau ở mọi chỗ trong app. */}
                  <span className="doc-icon" aria-hidden><ProviderIcon provider={d.provider} size={18} /></span>
                  <span className="docpick-text">
                    <span className="doc-name">
                      {/* Ghim hiện ra ở đây để giải thích vì sao mục này nằm trên đầu. */}
                      {pinnedIds.has(d.id) && (
                        <span className="docpick-pinmark" aria-hidden>📌</span>
                      )}
                      {d.name}
                    </span>
                    <span className="doc-sub">
                      {d.category ? `${d.category} · ` : ''}
                      {hostOf(d.url) || providerMeta(d.provider).label}
                    </span>
                  </span>
                  {already && <span className="muted docpick-note">đã gắn</span>}
                </button>
              );
            })}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-sm" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" onClick={confirm} disabled={picked.size === 0}>
            Gắn {picked.size > 0 ? `${picked.size} tài liệu` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
