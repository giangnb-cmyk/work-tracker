import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { fetchMemberDmRequest, requestMemberDmTest } from '../lib/memberDmWrites';
import SearchableSelect from './SearchableSelect';

/** Bot poll mỗi ~60s (bug_sync_poll_seconds) — chờ đủ dài rồi mới bỏ cuộc. */
const POLL_MS = 3000;
const MAX_POLLS = 30;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Admin-only (Cấu hình): chọn 1 member và bảo bot gửi DM điểm tuần dạng TEST.
 * Ghi vào `member_dm_requests`; bot đang chạy sẽ quét, DM và ghi kết quả lại.
 */
export default function MemberDmTest() {
  const { user, isAdmin } = useAuth();
  // Lấy members từ context CHỨ KHÔNG gọi useMembers() lần nữa: SprintContext đã subscribe
  // `profiles` rồi, mà useLiveQuery đặt tên channel theo table+filter nên hook thứ hai sinh
  // ra đúng topic `live:profiles:all` trùng y hệt. Hai channel cùng topic subscribe song
  // song là hỏng realtime, và Supabase retry liên tục nên lỗi nổ ra không dứt.
  // Cùng lý do với chỗ Features.tsx truyền task xuống thay vì để con tự fetch.
  const { members } = useSprintContext();
  const [target, setTarget] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Chặn setState sau khi unmount (vòng poll có thể sống lâu hơn component).
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  if (!isAdmin) return null;

  const options = members.map((m) => ({
    value: m.uid,
    label: m.displayName + (m.discordId ? '' : ' — chưa link Discord'),
  }));
  const chosen = members.find((m) => m.uid === target);

  async function handleTest() {
    if (!target) return;
    setSending(true);
    setMsg('Đang gửi yêu cầu…');
    try {
      const id = await requestMemberDmTest(target, user?.uid ?? '');
      setMsg('Đã xếp hàng — chờ bot xử lý (bot quét mỗi ~1 phút)…');
      for (let i = 0; i < MAX_POLLS; i++) {
        await sleep(POLL_MS);
        if (!alive.current) return;
        const r = await fetchMemberDmRequest(id);
        if (r.status !== 'pending') {
          setMsg(r.status === 'done' ? `✅ ${r.result}` : `⚠️ ${r.result}`);
          setSending(false);
          return;
        }
      }
      setMsg('⏳ Bot chưa phản hồi — kiểm tra bot có đang chạy và "member_dm.enabled" trong bot/settings.json.');
    } catch (err) {
      console.error('Gửi DM test thất bại', err);
      setMsg('Gửi yêu cầu thất bại (cần quyền admin; đã áp migration 0025 chưa?).');
    }
    if (alive.current) setSending(false);
  }

  return (
    <div className="glass section" style={{ padding: '1.5rem', maxWidth: 720, marginTop: '1.25rem' }}>
      <h3>DM điểm tuần qua Discord</h3>
      <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
        Bot nhắn riêng cho từng member số task <strong>đã hoàn thành trong tuần</strong> và{' '}
        <strong>còn tồn đọng</strong> kèm một câu động viên (mặc định thứ 5 hằng tuần — chỉnh trong{' '}
        <code>bot/settings.json &gt; member_dm</code>). Chọn một người để gửi thử ngay:
      </p>

      <div className="row" style={{ gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 260 }}>
          <SearchableSelect
            value={target}
            onChange={setTarget}
            options={options}
            placeholder="Chọn member…"
            panel="overlay"
          />
        </div>
        <button
          className="btn-primary"
          onClick={handleTest}
          disabled={sending || !target || !chosen?.discordId}
          title={chosen && !chosen.discordId ? 'Member này chưa điền Discord ID (tab Thành viên)' : undefined}
        >
          {sending ? 'Đang gửi…' : '🧪 Gửi test'}
        </button>
      </div>

      {chosen && !chosen.discordId && (
        <div className="callout-inline" style={{ marginTop: '1rem' }}>
          ⚠️ {chosen.displayName} chưa có Discord ID — điền ở tab <strong>Thành viên</strong> trước đã.
        </div>
      )}
      {msg && <div className="callout-inline" style={{ marginTop: '1rem' }}>{msg}</div>}
    </div>
  );
}
