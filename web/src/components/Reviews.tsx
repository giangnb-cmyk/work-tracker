import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useAdminCostProject } from '../hooks/useAdminCostProject';
import AdminProjectPicker from './cost/AdminProjectPicker';
import SprintNotesPanel from './review/SprintNotesPanel';
import PeriodReviewPanel from './review/PeriodReviewPanel';

/**
 * Tab "Đánh giá" (khu quản trị chung — admin-only). Chọn dự án ở header (dùng chung lựa chọn với
 * tab Chi phí qua useAdminCostProject); hai chế độ: ghi chú theo sprint và tổng hợp AI theo tháng/quý.
 */
export default function Reviews() {
  const { isAdmin } = useAuth();
  const { projects } = useSprintContext();
  const [projectId, setProjectId] = useAdminCostProject(projects);
  const [mode, setMode] = useState<'sprint' | 'period'>('sprint');
  if (!isAdmin) return null;

  return (
    <div className="fade-in">
      <div className="view-header row between">
        <div>
          <h1>Đánh giá thành viên</h1>
          <p>Ghi chú từng người theo sprint (tuần) và để AI tổng hợp đánh giá theo tháng/quý.</p>
        </div>
        <AdminProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
      </div>

      <div className="seg-toggle">
        <button className={`seg${mode === 'sprint' ? ' on' : ''}`} onClick={() => setMode('sprint')}>📝 Theo sprint</button>
        <button className={`seg${mode === 'period' ? ' on' : ''}`} onClick={() => setMode('period')}>🤖 Tổng hợp AI</button>
      </div>

      {mode === 'sprint' ? <SprintNotesPanel projectId={projectId} /> : <PeriodReviewPanel projectId={projectId} />}
    </div>
  );
}
