// Router tí hon cho SPA — không thêm dependency: path đổi bằng history API, component
// đọc qua useSyncExternalStore. Nhu cầu ở đây chỉ là tab phẳng + hai kiểu deep link
// (/bugs/<số>, /tasks/<id>), react-router là quá khổ.
//
// Đây cũng là NGUỒN SỰ THẬT của ViewId — Sidebar re-export để giữ import cũ.

import { useSyncExternalStore } from 'react';

/** Mọi tab của app. Path hợp lệ = '/' + id (riêng board có alias đẹp /sprint). */
export const ALL_VIEWS = [
  'dashboard', 'board', 'mytasks', 'features', 'backlog', 'bugs', 'timeline',
  'performance', 'visits', 'sprints', 'team', 'log', 'settings',
] as const;
export type ViewId = (typeof ALL_VIEWS)[number];

/** Alias path → ViewId (đường "đẹp" người dùng gõ/chia sẻ). */
const PATH_ALIASES: Record<string, ViewId> = { sprint: 'board' };
/** ViewId → path phát ra (ngược với PATH_ALIASES; không có thì path = id). */
const PRETTY_PATH: Partial<Record<ViewId, string>> = { board: 'sprint' };

export interface Route {
  view: ViewId;
  /** /bugs/<số> — số bug (đếm theo dự án). */
  bugNumber: number | null;
  /** /tasks/<id> — mở TaskModal theo id, nền là bảng sprint. */
  taskId: string | null;
  /** ?p=<projectId> — link chéo dự án; SprintContext đọc MỘT lần lúc nạp. */
  projectId: string | null;
}

/** Path chuẩn của một tab — Sidebar/nút đóng modal dùng chung để khỏi lệch alias. */
export function pathFor(view: ViewId): string {
  return `/${PRETTY_PATH[view] ?? view}`;
}

function parse(): Route {
  const [head, tail] = window.location.pathname.split('/').filter(Boolean);
  const projectId = new URLSearchParams(window.location.search).get('p');
  if (head === 'tasks' && tail) {
    return { view: 'board', bugNumber: null, taskId: tail, projectId };
  }
  if (head === 'bugs' && tail) {
    const n = Number(tail.replace(/^#/, ''));
    return { view: 'bugs', bugNumber: Number.isFinite(n) ? n : null, taskId: null, projectId };
  }
  const view = head
    ? PATH_ALIASES[head] ?? (ALL_VIEWS.includes(head as ViewId) ? (head as ViewId) : null)
    : null;
  // Path lạ → về trang tổng quan (URL giữ nguyên, vô hại).
  return { view: view ?? 'dashboard', bugNumber: null, taskId: null, projectId };
}

// useSyncExternalStore yêu cầu snapshot TRẢ VỀ CÙNG THAM CHIẾU khi không có gì đổi —
// cache theo (pathname + search), chỉ parse lại khi URL thật sự khác.
const urlKey = () => window.location.pathname + window.location.search;
let cachedKey = urlKey();
let cachedRoute = parse();
function snapshot(): Route {
  const k = urlKey();
  if (k !== cachedKey) {
    cachedKey = k;
    cachedRoute = parse();
  }
  return cachedRoute;
}

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
// Back/forward của trình duyệt. Đăng ký một lần cho cả đời app — SPA không unmount.
window.addEventListener('popstate', emit);

/** Đổi URL và báo mọi useRoute render lại. `replace` = không thêm mục vào history. */
export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  if (urlKey() === path) return;
  if (opts.replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  emit();
}

export function useRoute(): Route {
  return useSyncExternalStore((cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }, snapshot);
}
