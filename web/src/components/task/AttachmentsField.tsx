import { useRef, useState } from 'react';
import {
  makeLinkAttachment,
  providerMeta,
  uploadImageAttachment,
} from '../../lib/attachments';
import type { Attachment } from '../../types';

interface Props {
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
  disabled: boolean;
}

/** Ref images (uploaded or by URL) + embedded links (Drive/Discord/Notion/...). */
export default function AttachmentsField({ attachments, onChange, disabled }: Props) {
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function addLink() {
    const trimmed = url.trim();
    if (!trimmed) return;
    onChange([...attachments, makeLinkAttachment(trimmed)]);
    setUrl('');
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded: Attachment[] = [];
      for (const file of Array.from(files)) uploaded.push(await uploadImageAttachment(file));
      onChange([...attachments, ...uploaded]);
    } catch (err) {
      console.error('Upload failed', err);
      setError('Tải ảnh lên thất bại. Bật Firebase Storage, hoặc dán link ảnh thay thế.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function remove(id: string) {
    onChange(attachments.filter((a) => a.id !== id));
  }

  return (
    <div className="field">
      <span className="field-label">Tài liệu & ảnh đính kèm</span>

      {attachments.length > 0 && (
        <div className="attach-list">
          {attachments.map((a) => (
            <div key={a.id} className="attach-item">
              {a.kind === 'image' ? (
                <a href={a.url} target="_blank" rel="noreferrer" className="attach-thumb" title={a.name}>
                  <img src={a.url} alt={a.name} />
                </a>
              ) : (
                <a href={a.url} target="_blank" rel="noreferrer" className="attach-link" title={a.url}>
                  <span className="attach-icon">{providerMeta(a.provider).icon}</span>
                  <span className="attach-name">{a.name}</span>
                </a>
              )}
              {!disabled && (
                <button type="button" className="attach-remove" onClick={() => remove(a.id)} title="Xoá">
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!disabled && (
        <div className="attach-add">
          <div className="row" style={{ gap: '0.4rem' }}>
            <input
              className="input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink())}
              placeholder="Dán link Drive / Discord / Notion / ảnh…"
            />
            <button type="button" className="btn-sm" onClick={addLink}>Thêm link</button>
          </div>
          <div className="row" style={{ gap: '0.4rem', marginTop: '0.4rem' }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => onFiles(e.target.files)}
            />
            <button type="button" className="btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Đang tải…' : '⬆ Tải ảnh lên'}
            </button>
          </div>
          {error && <p className="error-text" style={{ marginTop: '0.4rem' }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
