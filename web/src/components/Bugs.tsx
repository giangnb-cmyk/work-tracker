import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useBugs } from '../hooks/useBugs';
import { useBugLabels } from '../hooks/useBugLabels';
import { useStoredView } from '../hooks/useStoredView';
import { updateBug } from '../lib/bugWrites';
import { seedDefaultBugLabels } from '../lib/bugLabelWrites';
import { requestBugSync } from '../lib/bugSyncWrites';
import { labelsForStatus } from '../lib/bugStatus';
import BugKanban from './bug/BugKanban';
import BugList from './bug/BugList';
import BugModal from './bug/BugModal';
import BugFilterBar, { matchBug, type BugFilterToken } from './bug/BugFilterBar';
import type { Bug, BugStatus } from '../types';

type ViewMode = 'kanban' | 'list';

const VIEW_MODES: readonly ViewMode[] = ['kanban', 'list'];
/** Nhớ kiểu xem qua các lần vào — sở thích cá nhân, không phải trạng thái phiên. */
const MODE_KEY = 'bugsView';

/** Bugs tab: per-project bug tracker with a Kanban board and a list view. */
export default function Bugs() {
  const { user, isAdmin } = useAuth();
  const { selectedProjectId, selectedProject, members } = useSprintContext();
  const { bugs, loading } = useBugs(selectedProjectId);
  const { labels } = useBugLabels(selectedProjectId);
  const [mode, selectMode] = useStoredView<ViewMode>(MODE_KEY, VIEW_MODES, 'kanban');
  const [editing, setEditing] = useState<Bug | null>(null);
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tokens, setTokens] = useState<BugFilterToken[]>([]);

  const labelsById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const canEditBug = (b: Bug) => isAdmin || b.reporterId === user?.uid || b.assigneeId === user?.uid;

  const key = (ids: string[]) => [...ids].sort().join(',');
  const meId = user?.uid ?? '';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bugs.filter((b) => {
      if (!matchBug(b, tokens, meId)) return false;
      if (!q) return true;
      return b.title.toLowerCase().includes(q) || `#${b.number}`.includes(q) || String(b.number) === q;
    });
  }, [bugs, query, tokens, meId]);

  /** Move on the kanban: set status AND swap the matching workflow tag, so the
   *  card's tag stays consistent (and the change pushes back to Discord). */
  function move(bug: Bug, status: BugStatus) {
    const nextLabels = labelsForStatus(bug.labelIds, status, labels);
    const changed = key(nextLabels) !== key(bug.labelIds);
    void updateBug(bug.id, {
      status,
      labelIds: nextLabels,
      ...(bug.discordThreadId && changed ? { pendingDiscordPush: true } : {}),
    });
  }

  async function seed() {
    if (!selectedProjectId) return;
    setSeeding(true);
    try {
      await seedDefaultBugLabels(selectedProjectId, user?.uid ?? '');
    } catch (err) {
      console.error('Tạo nhãn mặc định thất bại', err);
    } finally {
      setSeeding(false);
    }
  }

  async function syncDiscord() {
    if (!selectedProjectId) return;
    setSyncMsg('Đang gửi yêu cầu…');
    try {
      await requestBugSync(selectedProjectId, user?.uid ?? '');
      setSyncMsg('Đã yêu cầu — bot sẽ đồng bộ trong giây lát, danh sách tự cập nhật.');
    } catch (err) {
      console.error('Yêu cầu sync bug thất bại', err);
      setSyncMsg('Gửi yêu cầu thất bại (cần quyền admin).');
    }
    setTimeout(() => setSyncMsg(null), 6000);
  }

  if (!selectedProjectId) {
    return <div className="glass empty">Hãy chọn một dự án trước.</div>;
  }

  return (
    <div className="fade-in">
      <div className="view-header row between">
        <div>
          <h1>🐞 Bugs</h1>
          <p>{bugs.length} bug · {selectedProject?.name ?? 'dự án'}</p>
        </div>
        <div className="row" style={{ gap: '0.6rem', alignItems: 'center' }}>
          {isAdmin && labels.length === 0 && (
            <button className="btn-sm" onClick={seed} disabled={seeding}>
              {seeding ? 'Đang tạo…' : '＋ Bộ nhãn mặc định'}
            </button>
          )}
          {isAdmin && (
            <button className="btn-sm" onClick={syncDiscord} title="Kéo bug mới nhất từ forum Discord">🔄 Sync Discord</button>
          )}
          <div className="seg-toggle">
            <button className={`seg${mode === 'kanban' ? ' on' : ''}`} onClick={() => selectMode('kanban')}>Kanban</button>
            <button className={`seg${mode === 'list' ? ' on' : ''}`} onClick={() => selectMode('list')}>Danh sách</button>
          </div>
          <button className="btn-primary" onClick={() => setCreating(true)}>＋ Báo bug</button>
        </div>
      </div>

      {syncMsg && <div className="callout-inline" style={{ marginBottom: '1rem' }}>{syncMsg}</div>}

      <BugFilterBar
        labels={labels}
        members={members}
        tokens={tokens}
        onTokens={setTokens}
        query={query}
        onQuery={setQuery}
      />

      {loading ? (
        <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
      ) : mode === 'kanban' ? (
        <BugKanban bugs={filtered} labelsById={labelsById} onOpen={setEditing} onMove={move} canEditBug={canEditBug} />
      ) : (
        <BugList bugs={filtered} labelsById={labelsById} projectName={selectedProject?.name ?? ''} onOpen={setEditing} />
      )}

      {(editing || creating) && (
        <BugModal
          bug={editing}
          projectId={selectedProjectId}
          labels={labels}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}
