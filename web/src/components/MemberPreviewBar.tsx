import { useAuth } from '../contexts/AuthContext';

/**
 * Thanh báo khi đang XEM THỬ: admin/owner hạ mắt xuống Thành viên, hoặc owner hạ xuống
 * Admin thường (mất độc quyền owner: sửa dự án, đổi vai trò).
 *
 * Luôn hiện nhờ `.main-head` sticky ở Layout — quên mình đang xem thử rồi tưởng mất quyền
 * là kịch bản dễ xảy ra nhất.
 *
 * Nút thoát nằm ở ĐÂY chứ không phải trong sidebar — nhờ vậy sidebar hiển thị đúng y hệt
 * những gì vai được mô phỏng nhìn thấy, không lẫn nút chỉ admin/owner mới có.
 */
export default function MemberPreviewBar() {
  const { viewAsMember, viewAsAdmin, isRealAdmin, isRealOwner, setViewAsMember, setViewAsAdmin } = useAuth();
  const memberMode = viewAsMember && isRealAdmin;
  const adminMode = viewAsAdmin && isRealOwner;
  if (!memberMode && !adminMode) return null;

  return (
    <div className="preview-bar" role="status">
      <span className="preview-dot" aria-hidden />
      <span className="preview-text">
        {memberMode ? (
          <>
            <strong>Đang xem như Thành viên.</strong> Đây là mô phỏng giao diện — quyền thật của
            bạn ở database vẫn là admin.
          </>
        ) : (
          <>
            <strong>Đang xem như Admin thường.</strong> Các độc quyền owner (sửa dự án, đổi vai
            trò) đang ẩn — quyền thật của bạn vẫn là owner.
          </>
        )}
      </span>
      <button
        className="preview-exit"
        onClick={() => (memberMode ? setViewAsMember(false) : setViewAsAdmin(false))}
      >
        Thoát xem thử
      </button>
    </div>
  );
}
