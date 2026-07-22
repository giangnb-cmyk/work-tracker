// useAdminCostProject — dự án đang chọn cho các màn TÀI CHÍNH ở khu quản trị (Thành viên +
// Chi phí). Khu quản trị nằm NGOÀI dự án nên không dùng selectedProjectId của app; đây là lựa
// chọn riêng, nhớ qua localStorage và dùng CHUNG cho cả hai tab (chọn một lần, cả hai nhớ).

import { useCallback, useState } from 'react';
import type { Project } from '../types';

const KEY = 'admin-cost-project';

/** Trả về [projectId hợp lệ hiện tại, hàm chọn]. Mặc định về dự án đầu khi chưa chọn/không còn. */
export function useAdminCostProject(projects: Project[]): [string | null, (id: string) => void] {
  const [stored, setStored] = useState<string | null>(() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  });

  // Chốt theo danh sách dự án hiện có: id cũ đã xoá thì rơi về dự án đầu thay vì trỏ vào hư không.
  const projectId = stored && projects.some((p) => p.id === stored) ? stored : projects[0]?.id ?? null;

  const select = useCallback((id: string) => {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // không lưu được thì thôi, phiên này vẫn đổi
    }
    setStored(id);
  }, []);

  return [projectId, select];
}
