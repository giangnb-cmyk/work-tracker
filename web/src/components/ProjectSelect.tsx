import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { navigate } from '../lib/router';
import { formatDate, formatDayMonth } from '../lib/format';
import Avatar from './Avatar';
import MemberPreviewBar from './MemberPreviewBar';
import ProjectModal from './ProjectModal';
import { EyeIcon } from './icons';
import type { Project } from '../types';

/**
 * Landing page: pick a project before entering the app. Selecting one opens the
 * main workspace (Layout); the top-left icon there returns here.
 */
export default function ProjectSelect() {
  const { profile, isAdmin, isOwner, isRealAdmin, isRealOwner, viewAsMember, viewAsAdmin, setViewAsMember, setViewAsAdmin, signOut } = useAuth();
  const { projects, projectsLoading, selectProject } = useSprintContext();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  // Đang chạy lên trước, tạm dừng (0076) dồn xuống một khu riêng bên dưới — thứ tự trong
  // mỗi nhóm giữ nguyên như hook trả về, không sắp lại.
  const { active, paused } = useMemo(() => ({
    active: projects.filter((p) => p.isActive),
    paused: projects.filter((p) => !p.isActive),
  }), [projects]);

  /** Một thẻ dự án + nút bánh răng. Dùng chung cho cả hai nhóm để không lệch nhau một nhịp. */
  const card = (p: Project) => (
    <div key={p.id} className={`project-card-wrap${p.isActive ? '' : ' paused'}`}>
      <button className="project-card glass" onClick={() => selectProject(p.id)}>
        <span className="project-icon" style={{ background: `${p.color}22` }}>{p.icon}</span>
        <span className="project-name">{p.name}</span>
        {/* Nhãn đứng thành DÒNG RIÊNG, không nhét trong .project-name: tên dự án dài tự
            xuống dòng, nhãn dính đuôi thì nó kẹp vào giữa chữ trông như một phần của tên. */}
        {!p.isActive && (
          <span className="project-paused-tag" title={p.pausedAt ? `Tạm dừng từ ${formatDate(p.pausedAt)}` : 'Tạm dừng'}>
            ⏸ Tạm dừng{p.pausedAt ? ` · ${formatDayMonth(p.pausedAt)}` : ''}
          </span>
        )}
        <span className="project-meta">
          {p.notionProjectId ? '🔗 Notion · ' : ''}{formatDate(p.createdAt)}
        </span>
      </button>
      {/* Chỉ OWNER được sửa dự án (webhook, Notion, sheet…) — không mở cho admin thường. */}
      {isOwner && (
        <button
          className="project-edit-btn"
          title="Sửa dự án (webhook báo cáo, Notion, sheet…)"
          aria-label={`Sửa dự án ${p.name}`}
          onClick={(e) => { e.stopPropagation(); setEditing(p); }}
        >
          ⚙
        </button>
      )}
    </div>
  );

  return (
    <div className="project-select">
      {/* Đang xem thử như thành viên thì thanh báo + nút thoát hiện cả ở NGOÀI dự án —
          không có nó, admin bật xem thử rồi quay ra trang này là mất luôn lối về. */}
      <MemberPreviewBar />
      <header className="project-select-top">
        <div className="logo">
          <img className="mark-img" src="/IconGame.png" alt="" />
          <span>Work Tracker</span>
        </div>
        <div className="row" style={{ gap: '0.6rem' }}>
          {/* Cùng bộ đôi với Sidebar trong dự án: bật ở đây, thoát ở MemberPreviewBar. */}
          {isRealAdmin && !viewAsMember && (
            <button
              className="btn-sm preview-toggle-inline"
              onClick={() => setViewAsMember(true)}
              title="Xem giao diện đúng như một thành viên thường nhìn thấy"
            >
              <EyeIcon size={15} />
              Xem như thành viên
            </button>
          )}
          {/* Chỉ OWNER có gì để hạ xuống admin thường (mất sửa dự án / đổi vai trò). */}
          {isRealOwner && !viewAsAdmin && !viewAsMember && (
            <button
              className="btn-sm preview-toggle-inline"
              onClick={() => setViewAsAdmin(true)}
              title="Xem giao diện đúng như một admin thường (không có độc quyền owner)"
            >
              <EyeIcon size={15} />
              Xem như admin
            </button>
          )}
          {/* Một cửa vào khu quản trị (thành viên toàn web, cấu hình, hệ thống) — bao quát
              cả web nên sống NGOÀI dự án, mở thành trang riêng. Chỉ admin thấy nút này. */}
          {isAdmin && (
            <button className="btn-sm" onClick={() => navigate('/team')} title="Khu quản trị: thành viên toàn web, cấu hình, hệ thống">
              🛠️ Admin
            </button>
          )}
          <Avatar name={profile?.displayName ?? ''} photoURL={profile?.photoURL} size="sm" />
          <span className="muted" style={{ fontSize: '0.85rem' }}>{profile?.displayName}</span>
          <button className="btn-sm btn-signout" onClick={signOut}>Đăng xuất</button>
        </div>
      </header>

      <div className="project-select-body">
        <div className="view-header" style={{ textAlign: 'center' }}>
          <h1>Chọn dự án</h1>
          <p>Chọn một dự án để vào không gian làm việc.</p>
        </div>

        {projectsLoading ? (
          <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
        ) : (
          <>
            <div className="project-grid">
              {isAdmin && (
                <button className="project-card project-card-new" onClick={() => setCreating(true)}>
                  <span className="project-new-plus">＋</span>
                  <span>Tạo dự án mới</span>
                </button>
              )}
              {active.map(card)}
              {projects.length === 0 && !isAdmin && (
                // 0073: member chỉ thấy dự án mình có tên trong Thành viên dự án.
                <div className="glass empty">
                  Bạn chưa được thêm vào dự án nào. Nhờ admin thêm bạn vào dự án nhé.
                </div>
              )}
            </div>

            {/* Khu tạm dừng (0076) — chỉ hiện khi có, để đội nào không dùng thì màn hình y
                như cũ. Vẫn bấm vào được: dừng chạy nền chứ không khoá cửa. */}
            {paused.length > 0 && (
              <>
                <div className="project-group-head">
                  <span>⏸ Tạm dừng</span>
                  <span className="muted mono">{paused.length}</span>
                  <span className="muted project-group-note">
                    Không nhắc task, không báo cáo, không sync — dữ liệu vẫn còn nguyên.
                  </span>
                </div>
                <div className="project-grid">{paused.map(card)}</div>
              </>
            )}
          </>
        )}
      </div>

      {creating && <ProjectModal onClose={() => setCreating(false)} />}
      {editing && <ProjectModal project={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
