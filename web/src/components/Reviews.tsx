import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import SprintNotesPanel from './review/SprintNotesPanel';
import PeriodReviewPanel from './review/PeriodReviewPanel';

/**
 * Tab "Đánh giá" (admin-only — Layout đã chặn, chặn lần nữa cho chắc). Hai chế độ:
 * ghi chú theo sprint (tuần) và tổng hợp AI theo tháng/quý.
 */
export default function Reviews() {
  const { isAdmin } = useAuth();
  const [mode, setMode] = useState<'sprint' | 'period'>('sprint');
  if (!isAdmin) return null;

  return (
    <div className="fade-in">
      <div className="view-header">
        <h1>Đánh giá thành viên</h1>
        <p>Ghi chú từng người theo sprint (tuần) và để AI tổng hợp đánh giá theo tháng/quý.</p>
      </div>

      <div className="seg-toggle">
        <button className={`seg${mode === 'sprint' ? ' on' : ''}`} onClick={() => setMode('sprint')}>📝 Theo sprint</button>
        <button className={`seg${mode === 'period' ? ' on' : ''}`} onClick={() => setMode('period')}>🤖 Tổng hợp AI</button>
      </div>

      {mode === 'sprint' ? <SprintNotesPanel /> : <PeriodReviewPanel />}
    </div>
  );
}
