// NotifyContext — owns the "task done → ask, then notify" flow in one place so
// every status-change site (MyTasks, board, task modal) reuses the same popup and
// dispatch logic. On confirm it fires BOTH channels: Discord + in-app web notices.

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { notifyTaskDone } from '../lib/discordNotify';
import { createDoneNotifications } from '../lib/webNotify';
import type { Task } from '../types';

interface Pending {
  task: Task;
  sprintName?: string;
}

interface NotifyContextState {
  /** Ask the user whether to notify related people that `task` is done. */
  confirmDoneNotify: (task: Task, sprintName?: string) => void;
}

const NotifyContext = createContext<NotifyContextState | null>(null);

export function NotifyProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [pending, setPending] = useState<Pending | null>(null);
  const [sending, setSending] = useState(false);

  const value = useMemo<NotifyContextState>(
    () => ({ confirmDoneNotify: (task, sprintName) => setPending({ task, sprintName }) }),
    [],
  );

  async function dispatch() {
    if (!pending) return;
    const { task, sprintName } = pending;
    setSending(true);
    void notifyTaskDone(task, sprintName); // Discord — fire-and-forget
    try {
      await createDoneNotifications(task, profile?.uid ?? '', profile?.displayName ?? 'Ai đó');
    } catch (err) {
      console.error('Web notification dispatch failed', err);
    } finally {
      setSending(false);
      setPending(null);
    }
  }

  return (
    <NotifyContext.Provider value={value}>
      {children}
      {pending && (
        <div className="modal-overlay">
          <div className="modal fade-in" style={{ width: 'min(440px, 100%)' }}>
            <h2>Task đã hoàn thành 🎉</h2>
            <p className="muted" style={{ margin: '0.5rem 0 1.25rem' }}>
              Gửi thông báo cho những người liên quan (người thực hiện, người tạo, người theo dõi)
              về task <strong>“{pending.task.title}”</strong>?
            </p>
            <div className="row" style={{ gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn-ghost" disabled={sending} onClick={() => setPending(null)}>
                Không gửi
              </button>
              <button className="btn-primary" disabled={sending} onClick={dispatch}>
                {sending ? 'Đang gửi…' : 'Gửi thông báo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </NotifyContext.Provider>
  );
}

export function useNotify(): NotifyContextState {
  const ctx = useContext(NotifyContext);
  if (!ctx) throw new Error('useNotify must be used within NotifyProvider');
  return ctx;
}
