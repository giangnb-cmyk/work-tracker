import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabase';
import { createMember, updateMember, type MemberInput } from '../lib/memberWrites';
import { fetchCompHistory, upsertMemberComp } from '../lib/costWrites';
import { formatVnd } from '../lib/format';
import MoneyInput from './cost/MoneyInput';
import type { CompChange } from '../types';
import {
  JOB_ROLES,
  MEMBER_PERMS,
  USER_ROLE_LABEL,
  type JobRole,
  type MemberPerm,
  type TeamMember,
  type UserRole,
} from '../types';

interface MemberModalProps {
  member?: TeamMember | null; // null = add new
  onClose: () => void;
}

/** Admin dialog to add or edit a team member (role + Discord/Notion links). */
export default function MemberModal({ member, onClose }: MemberModalProps) {
  const { isOwner, isAdmin, profile } = useAuth();
  const isEdit = Boolean(member);
  // Chỉ owner phong/gỡ admin (0037). Không cho đổi role của CHÍNH owner qua UI — tránh tự
  // hạ quyền rồi khoá mình ra ngoài; muốn chuyển owner thì làm ở DB.
  const canSetRole = isOwner && member?.role !== 'owner';
  const [displayName, setDisplayName] = useState(member?.displayName ?? '');
  const [email, setEmail] = useState(member?.email ?? '');
  const [role, setRole] = useState<UserRole>(member?.role ?? 'member');
  const [perms, setPerms] = useState<MemberPerm[]>(member?.perms ?? []);
  const [jobRole, setJobRole] = useState<JobRole>(member?.jobRole ?? 'developer');
  const [discordId, setDiscordId] = useState(member?.discordId ?? '');
  const [notionUserId, setNotionUserId] = useState(member?.notionUserId ?? '');
  // Lương + thời gian làm việc (bảng member_compensation, toàn cục). Nạp riêng vì admin-only.
  const [salary, setSalary] = useState(0);
  const [workStart, setWorkStart] = useState('');
  const [workEnd, setWorkEnd] = useState('');
  // Lịch sử đổi lương (trigger 0057 ghi) — hiện ngay dưới ô lương.
  const [history, setHistory] = useState<CompChange[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nạp lương hiện có + lịch sử của người đang sửa (chỉ admin đọc được — RLS). Một lần.
  useEffect(() => {
    if (!member?.uid || !isAdmin) return;
    let alive = true;
    void supabase
      .from('member_compensation')
      .select('monthly_salary, start_date, end_date')
      .eq('member_id', member.uid)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return;
        setSalary(Number(data.monthly_salary ?? 0));
        setWorkStart((data.start_date as string | null) ?? '');
        setWorkEnd((data.end_date as string | null) ?? '');
      });
    fetchCompHistory(member.uid)
      .then((h) => {
        if (alive) setHistory(h);
      })
      .catch((err) => console.error('Tải lịch sử lương thất bại', err));
    return () => {
      alive = false;
    };
  }, [member?.uid, isAdmin]);

  async function handleSave() {
    if (!displayName.trim()) {
      setError('Cần nhập tên thành viên.');
      return;
    }
    setSaving(true);
    setError(null);
    const input: MemberInput = { displayName, email, role, perms, jobRole, discordId, notionUserId };
    try {
      let uid: string;
      if (isEdit && member) {
        await updateMember(member.uid, {
          displayName: displayName.trim(),
          email: email.trim(),
          role,
          perms,
          jobRole,
          discordId: discordId.trim(),
          notionUserId: notionUserId.trim(),
        });
        uid = member.uid;
      } else {
        uid = await createMember(input);
      }
      // Lương lưu ở bảng riêng (admin-only). Chỉ admin/owner mới thấy & ghi được phần này.
      if (isAdmin) {
        await upsertMemberComp(
          uid,
          { monthlySalary: salary, startDate: workStart || null, endDate: workEnd || null },
          profile?.uid ?? null,
        );
      }
      onClose();
    } catch (err) {
      console.error('Lưu thành viên thất bại', err);
      // Hiện lý do THẬT (memberWrites đã dịch sang câu đọc được) thay vì luôn "cần quyền
      // admin" — câu đó từng che một lỗi enum (thiếu 'qa') làm tưởng là lỗi phân quyền.
      setError(err instanceof Error ? err.message : 'Lưu thất bại.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal member-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? '👤 Sửa thành viên' : '👤 Thêm thành viên'}</h2>

        <label className="field">
          <span>Tên hiển thị *</span>
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Email</span>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@easygoing.vn" />
          </label>
          <label className="field">
            <span>Chuyên môn</span>
            <select className="select" value={jobRole} onChange={(e) => setJobRole(e.target.value as JobRole)}>
              {JOB_ROLES.map((r) => (
                <option key={r.id} value={r.id}>{r.icon} {r.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Vai trò</span>
            {canSetRole ? (
              // Owner không tự đưa mình vào ô này — chỉ cấp/gỡ admin cho người khác.
              <select className="select" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                <option value="member">Thành viên</option>
                <option value="admin">Admin</option>
              </select>
            ) : (
              <select className="select" value={role} disabled title="Chỉ owner đổi được vai trò">
                <option value={role}>{USER_ROLE_LABEL[role]}</option>
              </select>
            )}
          </label>
          <label className="field">
            <span>Discord User ID</span>
            <input className="input mono" value={discordId} onChange={(e) => setDiscordId(e.target.value)} placeholder="123456789012345678" />
          </label>
        </div>
        {role === 'member' && (
          <div className="field">
            <span className="field-label">Quyền thêm</span>
            <div className="perm-list">
              {MEMBER_PERMS.map((p) => (
                <label key={p.id} className="perm-row">
                  <input
                    type="checkbox"
                    checked={perms.includes(p.id)}
                    onChange={(e) =>
                      setPerms((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id)))
                    }
                  />
                  <span>
                    {p.label}
                    <small className="muted"> — {p.hint}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <label className="field">
          <span>Notion User ID (tuỳ chọn)</span>
          <input className="input mono" value={notionUserId} onChange={(e) => setNotionUserId(e.target.value)} />
        </label>

        {isAdmin && (
          <div className="comp-card">
            <div className="comp-card-title">
              💰 Lương &amp; thời gian làm việc
              <span className="muted comp-card-sub">chỉ admin &amp; owner thấy — nguồn cho tab Chi phí</span>
            </div>
            <div className="comp-grid">
              <label className="field">
                <span>Lương / tháng</span>
                <MoneyInput value={salary} onCommit={setSalary} className="cost-money-block" ariaLabel="Lương tháng" />
              </label>
              <label className="field">
                <span>Ngày bắt đầu</span>
                <input type="date" className="input" value={workStart} onChange={(e) => setWorkStart(e.target.value)} />
              </label>
              <label className="field">
                <span>Ngày kết thúc <small className="muted">(trống = còn làm)</small></span>
                <input type="date" className="input" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
              </label>
            </div>
            {history.length > 0 && (
              <div className="comp-history">
                <div className="comp-history-title">📈 Lịch sử lương</div>
                {history.map((h) => {
                  const up = h.oldSalary != null && h.newSalary > h.oldSalary;
                  const first = h.oldSalary == null;
                  return (
                    <div key={h.id} className="comp-hist-row">
                      <span className="muted mono comp-hist-date">
                        {h.changedAt ? h.changedAt.toDate().toLocaleDateString('vi-VN') : '—'}
                      </span>
                      {first ? (
                        <span className="muted">điền lần đầu →</span>
                      ) : (
                        <span className="mono muted">{formatVnd(h.oldSalary ?? 0)} →</span>
                      )}
                      <span className={`mono ${first ? '' : up ? 'comp-up' : 'comp-down'}`}>
                        {formatVnd(h.newSalary)}{!first && (up ? ' ↑' : ' ↓')}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="hint-box">
          💡 Discord User ID (không phải username): bật Developer Mode trong Discord → chuột phải
          vào người đó → Copy User ID. Dùng để mention khi task hoàn thành.
        </div>
        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <button className="btn-sm" onClick={onClose} disabled={saving}>Huỷ</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Đang lưu…' : isEdit ? 'Lưu' : 'Thêm'}
          </button>
        </div>
      </div>
    </div>
  );
}
