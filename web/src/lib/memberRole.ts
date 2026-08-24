// Chuyên môn của thành viên để HIỂN THỊ (icon + nhãn trên hàng task, nhóm bộ phận).
// Thuần — không React, không Supabase.
//
// Ưu tiên role ĐỘNG (bảng roles, 0072): role mới admin tạo phải hiện đúng tên/icon của nó.
// `profiles.job_role` chỉ là bản đồng bộ XẤP XỈ từ `roles.legacy_job_role` (vd role
// "3D Artist" map về '2d_artist' cho code cũ) — dùng nó khi đã có role động là hiện sai
// bộ phận (lỗi thật: người role 3D Artist bị xếp vào nhóm 2D Artist ở Bảng Sprint).
// Ai chưa chọn role động (thành viên thêm tay, hồ sơ cũ) mới rơi về enum jobRole.

import {
  JOB_ROLES,
  JOB_ROLE_ICON,
  JOB_ROLE_LABEL,
  type TeamMember,
  type TeamRole,
} from '../types';

/** Icon khi role động không có icon — hiếm, nhưng đừng để nhóm trống icon. */
const FALLBACK_ICON = '🧩';

export interface MemberRoleInfo {
  /** Khoá nhóm ổn định: `role:<id>` (role động) hoặc giá trị enum JobRole cũ. */
  key: string;
  icon: string;
  label: string;
}

/**
 * Dựng hàm tra `(uid) → chuyên môn` cho một danh sách thành viên. Trả `undefined` khi
 * uid trống / không phải thành viên / người đó chưa có cả role động lẫn jobRole cũ.
 */
export function memberRoleResolver(
  members: TeamMember[],
  roles: TeamRole[],
): (uid: string | null | undefined) => MemberRoleInfo | undefined {
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const byUid = new Map<string, MemberRoleInfo>();
  for (const m of members) {
    const r = m.roleId ? roleById.get(m.roleId) : undefined;
    if (r) {
      byUid.set(m.uid, { key: `role:${r.id}`, icon: r.icon || FALLBACK_ICON, label: r.name });
    } else if (m.jobRole) {
      byUid.set(m.uid, { key: m.jobRole, icon: JOB_ROLE_ICON[m.jobRole], label: JOB_ROLE_LABEL[m.jobRole] });
    }
  }
  return (uid) => (uid ? byUid.get(uid) : undefined);
}

/**
 * Thứ tự nhóm bộ phận CỐ ĐỊNH giữa các sprint: role động theo `sort` của bảng roles
 * (danh sách `roles` truyền vào đã sắp sẵn — xem useRoles), rồi tới enum cũ theo JOB_ROLES.
 * Sắp theo số task thì mục nhảy chỗ mỗi lần đổi sprint, rất khó dùng.
 */
export function deptOrder(roles: TeamRole[]): MemberRoleInfo[] {
  return [
    ...roles.map((r) => ({ key: `role:${r.id}`, icon: r.icon || FALLBACK_ICON, label: r.name })),
    ...JOB_ROLES.map((r) => ({ key: r.id as string, icon: r.icon, label: r.label })),
  ];
}
