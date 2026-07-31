// NotifyContext — owns the "task done → notify" flow in one place so every
// status-change site (MyTasks, board, backlog, task modal…) reuses the same dispatch.
// Fires BOTH channels: Discord + in-app web notices.
//
// Gửi NGAY, không hỏi confirm: trước đây có popup "Gửi thông báo?" nhưng thực tế lần nào
// cũng bấm Gửi — hỏi chỉ thêm một cú bấm cho mọi task (đã bỏ theo yêu cầu). Đường subtask
// (notifySubtaskDone) vốn đã tự gửi, giờ hai đường đồng nhất.

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { notifyTaskDone } from '../lib/discordNotify';
import { createDoneNotifications } from '../lib/webNotify';
import type { Task } from '../types';

interface NotifyContextState {
  /** Báo người liên quan rằng `task` đã xong — bắn liền cả Discord lẫn thông báo web. */
  notifyDone: (task: Task, sprintName?: string) => void;
}

const NotifyContext = createContext<NotifyContextState | null>(null);

export function NotifyProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const uid = profile?.uid ?? '';
  const displayName = profile?.displayName ?? 'Ai đó';

  const value = useMemo<NotifyContextState>(
    () => ({
      notifyDone: (task, sprintName) => {
        // Cả hai kênh đều fire-and-forget: thông báo hỏng không được chặn việc đổi status.
        void notifyTaskDone(task, sprintName);
        void createDoneNotifications(task, uid, displayName).catch((err) => {
          console.error('Gửi thông báo web thất bại', err);
        });
      },
    }),
    [uid, displayName],
  );

  return <NotifyContext.Provider value={value}>{children}</NotifyContext.Provider>;
}

export function useNotify(): NotifyContextState {
  const ctx = useContext(NotifyContext);
  if (!ctx) throw new Error('useNotify must be used within NotifyProvider');
  return ctx;
}
