// Cấu hình Capacitor — bọc dist/ (build Vite y hệt bản Vercel) thành app Android/iOS.
//
// ⚠️ appId là danh tính app trên Play Store / App Store — ĐÃ PUBLISH THÌ KHÔNG ĐỔI ĐƯỢC.
// ⚠️ KHÔNG đổi androidScheme/hostname sau khi phát hành: localStorage/IndexedDB khoá
//    theo origin (https://localhost) — đổi là toàn bộ user bị đăng xuất + mất state local.
// Dev live-reload: thêm tạm `server: { url: 'http://<ip-máy-dev>:5173', cleartext: true }`
// rồi `npx cap sync` — NHỚ GỠ trước khi build bản phát hành.

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mio.app.manager',
  appName: 'Work Tracker',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      // Nền trùng --bg của theme để không chớp trắng lúc mở app; tự ẩn sau khi
      // App.tsx gọi nativeHideSplash() (khi phiên đăng nhập đã check xong).
      backgroundColor: '#0f172a',
      launchAutoHide: false,
      // Lưới an toàn: nếu web crash trước khi kịp hide thì splash cũng tự tắt.
      launchShowDuration: 5000,
    },
    Keyboard: {
      // 'body' giữ viewport unit (dvh) ổn định khi bàn phím mở — 'native' (mặc định)
      // co cả webview làm layout fixed-bottom nhảy loạn.
      resize: 'body',
      style: 'DARK',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
