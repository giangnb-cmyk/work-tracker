import { useState } from 'react';
import type { AppError } from '../types';

interface ErrorPanelProps {
  errors: AppError[];
  open: boolean;
  onClose: () => void;
  onClear: () => void;
}

/** Nhật ký lỗi: ngăn kéo trượt từ mép phải. Đóng bằng nút ✕, nền mờ, hoặc Esc. */
export default function ErrorPanel({ errors, open, onClose, onClear }: ErrorPanelProps) {
  return (
    <>
      {/* Nền mờ bấm-để-đóng. Luôn render để còn chạy transition lúc đóng; `open` bật
          pointer-events, nên khi đóng nó không nuốt cú click nào. */}
      <div className={`errlog-scrim${open ? ' on' : ''}`} onClick={onClose} />

      <aside className={`errlog-panel${open ? ' on' : ''}`} aria-hidden={!open}>
        <header className="errlog-head">
          <h3>Nhật ký lỗi {errors.length > 0 && <span className="errlog-count">{errors.length}</span>}</h3>
          <div className="row" style={{ gap: '0.4rem' }}>
            {errors.length > 0 && (
              <button type="button" className="btn-sm" onClick={onClear}>
                Xoá hết
              </button>
            )}
            <button type="button" className="errlog-close" onClick={onClose} aria-label="Đóng nhật ký lỗi">
              ✕
            </button>
          </div>
        </header>

        <div className="errlog-list">
          {errors.length === 0 ? (
            <div className="glass empty">Chưa có lỗi nào trong phiên này. 🎉</div>
          ) : (
            errors.map((e) => <ErrorRow key={e.id} error={e} />)
          )}
        </div>

        <footer className="errlog-foot muted">
          Chỉ giữ 50 lỗi gần nhất của phiên này — tải lại trang là mất. Cần đào sâu thì mở Console.
        </footer>
      </aside>
    </>
  );
}

/** Một dòng lỗi; phần chi tiết (stack/JSON) gập lại vì thường rất dài. */
function ErrorRow({ error }: { error: AppError }) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="errlog-item">
      <div className="errlog-item-top">
        <span className="errlog-src">{error.source}</span>
        <span className="errlog-time mono">{error.at.toLocaleTimeString('vi-VN')}</span>
      </div>
      <p className="errlog-item-msg">{error.message}</p>
      {error.note && <p className="errlog-note">{error.note}</p>}
      {error.detail && (
        <>
          <button type="button" className="errlog-detail-toggle" onClick={() => setShowDetail((v) => !v)}>
            {showDetail ? '▾ Ẩn chi tiết' : '▸ Chi tiết'}
          </button>
          {showDetail && <pre className="errlog-detail">{error.detail}</pre>}
        </>
      )}
    </div>
  );
}
