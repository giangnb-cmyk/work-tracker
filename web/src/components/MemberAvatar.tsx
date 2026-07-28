import { useSprintContext } from '../contexts/SprintContext';
import Avatar from './Avatar';

interface Props {
  /** uid của người (→ profiles.id). null/thiếu = chưa giao → về chữ cái đầu. */
  uid: string | null | undefined;
  /** Tên denormalize sẵn trên bản ghi (task.assigneeName…) — dùng luôn, khỏi chờ roster. */
  name: string;
  size?: 'sm' | 'md';
}

/**
 * Avatar tra ẢNH THẬT từ roster theo uid.
 *
 * Task/bug/activity chỉ mang TÊN denormalize chứ không mang `photoURL`, nên `<Avatar>`
 * trần ở những chỗ đó luôn rơi về chữ cái đầu — bảng Sprint toàn vòng tròn "TN"/"ND"
 * trong khi tab Thành viên có ảnh thật. Tra qua `members` của SprintContext (roster đã
 * tải sẵn cho cả app, không tốn query mới) để mọi nơi hiện cùng một khuôn mặt.
 *
 * Người đã rời nhóm / bot: không khớp uid nào → `Avatar` tự về chữ cái đầu như cũ.
 */
export default function MemberAvatar({ uid, name, size = 'md' }: Props) {
  const { members } = useSprintContext();
  const photoURL = uid ? members.find((m) => m.uid === uid)?.photoURL : '';
  return <Avatar name={name} photoURL={photoURL || undefined} size={size} />;
}
