import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import { useClickOutside } from '../hooks/useClickOutside';
import { markNotificationsRead } from '../lib/webNotify';
import { formatDate } from '../lib/format';

/** Bell + unread badge + dropdown of in-app notifications. Also mirrors new ones
 *  to a browser notification when the tab is in the background. */
export default function NotificationBell() {
  const { user } = useAuth();
  const { items, unread } = useNotifications(user?.uid ?? '');
  const [open, setOpen] = useState(false);
  const lastSeenId = useRef<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useClickOutside(wrapRef, close, open);

  // Ask once; only used to surface a native notice for background tabs.
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  // Fire a browser notification for the newest unread item we haven't shown yet.
  useEffect(() => {
    const newest = items.find((n) => !n.read);
    if (!newest || newest.id === lastSeenId.current) return;
    lastSeenId.current = newest.id;
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification('Work Tracker', { body: newest.body });
    }
  }, [items]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      void markNotificationsRead(items.filter((n) => !n.read).map((n) => n.id));
    }
  }

  return (
    <div className="notif-wrap" style={{ position: 'relative' }} ref={wrapRef}>
      <button className="icon-btn" onClick={toggle} aria-label="Thông báo" title="Thông báo">
        🔔
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel glass fade-in">
          <div className="notif-head">Thông báo</div>
          {items.length === 0 ? (
            <div className="empty" style={{ padding: '1rem' }}>Chưa có thông báo.</div>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li key={n.id} className={n.read ? 'notif-item' : 'notif-item unread'}>
                  <span className="notif-body">{n.body}</span>
                  <span className="notif-time mono">{formatDate(n.createdAt ?? null)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
