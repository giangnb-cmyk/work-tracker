// Ghi lượt truy cập web (bảng `visits`, migration 0023).
//
// Một lượt = một PHIÊN mở app, không phải mỗi lần render hay mỗi lần đổi tab. Chốt chặn là
// sessionStorage: nó sống đúng bằng vòng đời của MỘT tab trình duyệt, nên F5 không đếm lại
// (khác localStorage — nó sẽ khoá vĩnh viễn, sau lần đầu không bao giờ ghi nữa).

import { supabase } from '../supabase';

const SESSION_KEY = 'visitLogged';

/** sessionStorage có thể ném lỗi khi bị chặn cookie. Mất một lượt thống kê thì thôi. */
function alreadyLogged(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return true; // đọc không được -> coi như đã ghi, thà thiếu còn hơn ghi trùng mỗi render
  }
}

function markLogged() {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // Không đánh dấu được thì thôi; alreadyLogged() ở trên đã chặn vòng lặp rồi.
  }
}

/**
 * Ghi một lượt truy cập cho `userId`, tối đa một lần mỗi phiên tab.
 *
 * Fire-and-forget có chủ đích: đây là số liệu thống kê, hỏng thì tuyệt đối không được chặn
 * người dùng vào app. Đánh dấu phiên TRƯỚC khi gọi mạng để hai lần gọi song song (React
 * strict mode gọi effect hai lần) không tạo hai dòng.
 */
export async function logVisit(userId: string): Promise<void> {
  if (!userId || alreadyLogged()) return;
  markLogged();
  const { error } = await supabase.from('visits').insert({ user_id: userId });
  if (error) console.error('Ghi lượt truy cập thất bại', error);
}
