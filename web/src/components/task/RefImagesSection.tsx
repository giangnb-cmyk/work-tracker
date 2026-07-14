import { useEffect, useRef, useState } from 'react';
import { uploadImageAttachment } from '../../lib/attachments';
import type { Attachment } from '../../types';

interface Props {
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
  disabled: boolean;
}

/**
 * Standalone "Ref" section (divider + label + wrapping thumbnail grid). Owns
 * image upload; edits the shared attachments array in place so link documents
 * managed elsewhere are preserved.
 */
export default function RefImagesSection({ attachments, onChange, disabled }: Props) {
  const images = attachments.filter((a) => a.kind === 'image');
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Esc closes the lightbox.
  useEffect(() => {
    if (!preview) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPreview(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [preview]);

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
      setError('Tải ảnh lên thất bại. Bật Storage, hoặc dán link ảnh vào phần Tài liệu.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function remove(id: string) {
    onChange(attachments.filter((a) => a.id !== id));
  }

  // Non-admin with no images → nothing to show.
  if (images.length === 0 && disabled) return null;

  return (
    <section className="tm-section ref-section">
      <div className="ref-divider" />
      <h4 className="tm-h">🖼️ Ref</h4>

      <div className="ref-grid">
        {images.map((img) => (
          <figure key={img.id} className="ref-card">
            <button type="button" className="ref-thumb" onClick={() => setPreview(img)} title="Xem ảnh">
              <img src={img.url} alt={img.name} loading="lazy" />
              <span className="ref-overlay" aria-hidden>🔍</span>
            </button>
            {!disabled && (
              <button type="button" className="ref-remove" onClick={() => remove(img.id)} title="Xoá ảnh">✕</button>
            )}
            <figcaption className="ref-name" title={img.name}>{img.name}</figcaption>
          </figure>
        ))}

        {!disabled && (
          <button
            type="button"
            className="ref-addtile"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title="Thêm ảnh"
          >
            {uploading ? '…' : '＋'}
          </button>
        )}
      </div>

      {images.length === 0 && !disabled && <p className="st-empty">Chưa có ảnh tham khảo.</p>}
      {error && <p className="error-text">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => onFiles(e.target.files)}
      />

      {preview && (
        <div className="lightbox" onClick={() => setPreview(null)}>
          <img src={preview.url} alt={preview.name} onClick={(e) => e.stopPropagation()} />
          <span className="lightbox-name mono">{preview.name}</span>
        </div>
      )}
    </section>
  );
}
