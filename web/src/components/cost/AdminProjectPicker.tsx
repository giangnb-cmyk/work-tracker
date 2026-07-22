import type { Project } from '../../types';

interface Props {
  projects: Project[];
  value: string | null;
  onChange: (id: string) => void;
  label?: string;
}

/** Ô chọn dự án cho các màn tài chính ở khu quản trị (dùng chung Thành viên + Chi phí). */
export default function AdminProjectPicker({ projects, value, onChange, label = 'Dự án' }: Props) {
  return (
    <label className="field cost-project-picker">
      <span>{label}</span>
      <select
        className="select"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={projects.length === 0}
      >
        {projects.length === 0 && <option value="">Chưa có dự án</option>}
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.icon} {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
