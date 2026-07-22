import { useSprintContext } from '../contexts/SprintContext';
import { useAdminCostProject } from '../hooks/useAdminCostProject';
import AdminProjectPicker from './cost/AdminProjectPicker';
import CostManagement from './CostManagement';

/**
 * Tab "Chi phí" trong khu quản trị (GlobalAdmin) — NGOÀI dự án, nên tự chọn dự án để tính
 * ("chia theo dự án"). Header + ô chọn dự án ở đây; phần tính toán để CostManagement lo.
 */
export default function CostAdmin() {
  const { projects, projectsLoading } = useSprintContext();
  const [projectId, setProjectId] = useAdminCostProject(projects);

  if (projectsLoading) {
    return (
      <div className="center-screen" style={{ minHeight: 200 }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="view-header row between">
        <div>
          <h1>Chi phí dự án</h1>
          <p>Tính chi phí theo từng dự án: lương nhân sự, thiết bị/vận hành, và dự chi. Chỉ admin &amp; owner.</p>
        </div>
        <AdminProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
      </div>

      {projectId ? (
        <CostManagement projectId={projectId} />
      ) : (
        <div className="glass empty">Chưa có dự án nào để tính chi phí.</div>
      )}
    </div>
  );
}
