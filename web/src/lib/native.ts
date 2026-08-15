// Cầu nối Capacitor — TOÀN BỘ code chỉ-chạy-trên-app-native gom ở đây, phần còn lại
// của web không cần biết nó đang chạy trong app hay trình duyệt.
//
// Nguyên tắc: mọi hàm đều no-op trên web (gate bằng isNative), và plugin Capacitor
// được import ĐỘNG để bundle web (Vercel) không phải tải chúng ở đường găng.

import { Capacitor } from '@capacitor/core';
import { supabase } from '../supabase';

/** Đang chạy trong app Android/iOS (webview Capacitor), không phải trình duyệt. */
export const isNative = Capacitor.isNativePlatform();

/**
 * Khởi động phần native: status bar, nút Back Android, bàn phím, resume.
 * Gọi MỘT lần từ main.tsx — trước cả render (không chờ, các listener tự gắn dần).
 */
export function initNative(): void {
  if (!isNative) return;

  // Status bar: icon SÁNG trên nền tối cố định của theme — không theo system theme,
  // vì app luôn tối; để mặc định thì user hệ light bị icon đen trên nền #0f172a.
  void import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    void StatusBar.setStyle({ style: Style.Dark });
  });

  void import('@capacitor/app').then(({ App }) => {
    // Nút Back cứng của Android: ưu tiên đóng lớp phủ trên cùng (modal/sheet/lightbox),
    // hết lớp phủ thì lùi lịch sử SPA, hết lịch sử thì thu nhỏ app (không thoát hẳn —
    // thoát là mất phiên realtime, mở lại chậm).
    void App.addListener('backButton', ({ canGoBack }) => {
      if (closeTopOverlay()) return;
      if (canGoBack) window.history.back();
      else void App.minimizeApp();
    });

    // App quay lại foreground: socket realtime đã chết lúc bị treo nền, thay đổi trong
    // lúc đó không bao giờ dội về → useLiveQuery lắng nghe event này để refetch.
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) window.dispatchEvent(new Event('app-resume'));
    });
  });

  // Bàn phím mở thì giấu bottom tab bar (CSS body.kb-open) — không giấu thì bar
  // nổi lên trên bàn phím, che mất ô nhập đang gõ.
  void import('@capacitor/keyboard').then(({ Keyboard }) => {
    void Keyboard.addListener('keyboardWillShow', () => document.body.classList.add('kb-open'));
    void Keyboard.addListener('keyboardWillHide', () => document.body.classList.remove('kb-open'));
  });
}

/**
 * Đóng lớp phủ trên cùng nếu có. Modal ở đây là hand-rolled (mỗi component tự giữ
 * state mở/đóng) nên không có registry chung — nhưng lớp phủ nào cũng đóng khi tap
 * backdrop, vậy "bấm Back = tap backdrop trên cùng". Click DOM thật đi qua delegation
 * của React nên onClick của overlay chạy đúng đường code đóng (có autosave nếu có).
 */
function closeTopOverlay(): boolean {
  const overlays = document.querySelectorAll<HTMLElement>(
    '.lightbox, .modal-overlay, .sheet-overlay, .drp-panel',
  );
  const top = overlays[overlays.length - 1];
  if (!top) return false;
  // Riêng DateRangePicker đóng bằng click-ngoài (mousedown) chứ không phải click
  // backdrop — mô phỏng mousedown ra ngoài panel.
  if (top.classList.contains('drp-panel')) {
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    return true;
  }
  top.click();
  return true;
}

/**
 * Tắt splash screen — App.tsx gọi khi check phiên đăng nhập xong, để user thấy thẳng
 * màn hình đúng (login hoặc app) thay vì chớp qua màn login rồi mới vào app.
 */
export function nativeHideSplash(): void {
  if (!isNative) return;
  void import('@capacitor/splash-screen').then(({ SplashScreen }) => SplashScreen.hide());
}

/**
 * Đăng nhập Google KIỂU NATIVE (sheet chọn tài khoản của hệ điều hành) rồi đưa
 * idToken cho Supabase. Bắt buộc trên app: Google CHẶN OAuth chạy trong webview
 * (lỗi disallowed_useragent) nên signInWithOAuth của bản web không dùng được.
 *
 * Cần VITE_GOOGLE_WEB_CLIENT_ID = Web client ID của Google provider trong Supabase
 * (đúng cái đang khai ở Supabase → Auth → Providers → Google, KHÔNG phải Android/iOS
 * client ID). Android còn cần một OAuth client type Android (package + SHA-1) trong
 * cùng Google Cloud project — xem skill port-web-to-mobile-app.
 */
export async function nativeGoogleSignIn(): Promise<void> {
  // Ưu tiên biến riêng; không có thì dùng chung VITE_GOOGLE_CLIENT_ID (client Web đã
  // dùng cho Xuất Google Sheet — comment trong .env.example nói rõ dùng chung được).
  const webClientId = (import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID ||
    import.meta.env.VITE_GOOGLE_CLIENT_ID) as string | undefined;
  if (!webClientId) {
    throw new Error(
      'Thiếu VITE_GOOGLE_WEB_CLIENT_ID (Web client ID của Google provider trong Supabase). ' +
        'Đặt trong web/.env.local rồi build lại app.',
    );
  }

  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  await SocialLogin.initialize({ google: { webClientId } });
  const res = await SocialLogin.login({
    provider: 'google',
    options: { scopes: ['email', 'profile'] },
  });

  const idToken = (res.result as { idToken?: string | null }).idToken;
  if (!idToken) throw new Error('Google không trả về idToken.');

  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw error;
}
