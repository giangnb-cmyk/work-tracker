// Ghi Google Sheets TRỰC TIẾP từ trình duyệt bằng TÀI KHOẢN GOOGLE của người đang dùng
// (Google Identity Services token client) — không đi qua bot/service account.
//
// Cần VITE_GOOGLE_CLIENT_ID (OAuth Web client — dùng chung client của đăng nhập Google/
// Supabase được, miễn là "Authorized JavaScript origins" có domain web + localhost).
// Lần đầu bấm Xuất sẽ hiện popup Google xin quyền Sheets; các lần sau trong phiên đi im lặng.
// Người xuất phải có quyền EDIT trên sheet đích (sheet của chính họ thì nghiễm nhiên có).

/* eslint-disable @typescript-eslint/no-explicit-any */

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';

declare global {
  interface Window {
    google?: any;
  }
}

let gisLoading: Promise<void> | null = null;

/** Nạp script GIS đúng một lần (không nhét vào index.html — chỉ màn Chi phí cần). */
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisLoading) {
    gisLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Không tải được Google Identity Services (mạng/chặn script?).'));
      document.head.appendChild(s);
    });
  }
  return gisLoading;
}

// Token sống ~1h — cache trong tab, hết hạn thì xin lại (im lặng nếu đã consent).
let cachedToken: { token: string; exp: number } | null = null;

/** Access token Google Sheets của NGƯỜI ĐANG DÙNG. Phải gọi từ user gesture (onClick). */
export async function getSheetsToken(): Promise<string> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) {
    throw new Error(
      'Thiếu VITE_GOOGLE_CLIENT_ID (OAuth Web client id) — đặt ở env Vercel rồi redeploy. ' +
        'Nhớ thêm domain web vào "Authorized JavaScript origins" của client đó.',
    );
  }
  if (cachedToken && Date.now() < cachedToken.exp - 60_000) return cachedToken.token;
  await loadGis();
  return new Promise<string>((resolve, reject) => {
    const tc = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp: any) => {
        if (resp?.error) {
          reject(new Error(`Google từ chối cấp quyền: ${resp.error}${resp.error_description ? ` — ${resp.error_description}` : ''}`));
          return;
        }
        cachedToken = {
          token: resp.access_token as string,
          exp: Date.now() + (Number(resp.expires_in) || 3600) * 1000,
        };
        resolve(cachedToken.token);
      },
      error_callback: (err: any) => reject(new Error(`Không mở được cửa sổ Google (${err?.type ?? 'popup bị chặn?'}).`)),
    });
    // prompt '' = im lặng khi đã consent trong phiên; lần đầu Google tự hiện popup.
    tc.requestAccessToken({ prompt: '' });
  });
}

async function gcall(token: string, method: string, url: string, body?: unknown): Promise<any> {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 403) {
    throw new Error('Google chặn (403): tài khoản của bạn không có quyền Edit trên sheet này.');
  }
  if (res.status === 404) throw new Error('Không thấy sheet (404) — sai spreadsheet id?');
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Sheets API lỗi ${res.status}: ${detail.slice(0, 180)}`);
  }
  return res.json();
}

/**
 * Ghi một bảng (mảng hàng) vào tab của spreadsheet: tạo tab nếu chưa có, DỌN SẠCH giá trị
 * cũ rồi ghi bản mới — bấm Xuất nhiều lần vô hại. Trả về số ô đã ghi.
 */
export async function writeSheetTab(
  sheetId: string,
  tab: string,
  values: (string | number)[][],
): Promise<number> {
  const token = await getSheetsToken();
  const meta = await gcall(token, 'GET', `${API}/${sheetId}?fields=sheets.properties.title`);
  const titles: string[] = (meta.sheets ?? []).map((s: any) => s.properties?.title);
  if (!titles.includes(tab)) {
    await gcall(token, 'POST', `${API}/${sheetId}:batchUpdate`, {
      requests: [{ addSheet: { properties: { title: tab } } }],
    });
  }
  const range = encodeURIComponent(`'${tab}'!A1:ZZ100000`);
  await gcall(token, 'POST', `${API}/${sheetId}/values/${range}:clear`, {});
  const target = encodeURIComponent(`'${tab}'!A1`);
  const r = await gcall(token, 'PUT', `${API}/${sheetId}/values/${target}?valueInputOption=RAW`, { values });
  return Number(r.updatedCells ?? 0);
}
