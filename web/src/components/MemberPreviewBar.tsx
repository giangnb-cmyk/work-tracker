import { useAuth } from '../contexts/AuthContext';

/**
 * Thanh báo khi admin đang xem app bằng con mắt thành viên.
 *
 * Luôn hiện nhờ `.main-head` sticky ở Layout — admin quên mình đang ở chế độ xem thử rồi
 * tưởng mất quyền là kịch bản dễ xảy ra nhất.
 *
 * Nút thoát nằm ở ĐÂY chứ không phải trong sidebar — nhờ vậy sidebar hiển thị đúng y hệt
 * những gì một thành viên thật nhìn thấy, không lẫn nút chỉ admin mới có.
 */
export default function MemberPreviewBar() {
  const { viewAsMember, isRealAdmin, setViewAsMember } = useAuth();
  if (!viewAsMember || !isRealAdmin) return null;

  return (
    <div className="preview-bar" role="status">
      <span className="preview-dot" aria-hidden />
      <span className="preview-text">
        <strong>Đang xem như Thành viên.</strong> Đây là mô phỏng giao diện — quyền thật của
        bạn ở database vẫn là admin.
      </span>
      <button className="preview-exit" onClick={() => setViewAsMember(false)}>
        Thoát xem thử
      </button>
    </div>
  );
}
