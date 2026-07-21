import { useMemo, useState } from 'react';
import { ROLE_META, WORKFLOWS, type DodGroup, type RoleKey, type WorkflowDoc, type WorkflowStep } from '../lib/workflows';

/** Class màu theo vai trò (viền trái node, chip vai trò, tiêu đề nhóm DoD). */
const ROLE_CLASS: Record<RoleKey, string> = { gd: 'r-gd', dev: 'r-dev', qa: 'r-qa', all: 'r-all' };

/** Màu của một bước: 1 vai trò -> theo vai trò đó; nhiều vai trò -> "liên phòng". */
function stepRoleClass(step: WorkflowStep): string {
  return step.roles.length === 1 ? ROLE_CLASS[step.roles[0]] : ROLE_CLASS.all;
}

/**
 * Tab "Quy trình": xem quy trình phối hợp giữa các bộ phận (GD/Dev/QA…). Dữ liệu ở
 * lib/workflows.ts — thêm quy trình mới chỉ cần bổ sung vào đó, UI tự lên.
 */
export default function Workflow() {
  const [activeId, setActiveId] = useState(WORKFLOWS[0]?.id ?? '');
  const doc = useMemo(() => WORKFLOWS.find((w) => w.id === activeId) ?? WORKFLOWS[0], [activeId]);

  if (!doc) {
    return (
      <div className="fade-in">
        <div className="view-header"><h1>📘 Quy trình làm việc</h1></div>
        <div className="glass empty">Chưa có quy trình nào.</div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="view-header">
        <h1>📘 Quy trình làm việc</h1>
        <p>Quy trình phối hợp giữa các bộ phận. Sau này sẽ thêm quy trình của từng bộ phận ở đây.</p>
      </div>

      {WORKFLOWS.length > 1 && (
        <div className="wf-tabs">
          {WORKFLOWS.map((w) => (
            <button key={w.id} className={`chip${w.id === activeId ? ' on' : ''}`} onClick={() => setActiveId(w.id)}>
              {w.title}
            </button>
          ))}
        </div>
      )}

      <WorkflowView doc={doc} />
    </div>
  );
}

function WorkflowView({ doc }: { doc: WorkflowDoc }) {
  return (
    <>
      <div className="glass section wf-head">
        <h2 className="wf-title">{doc.title}</h2>
        <p className="wf-scope">{doc.scope}</p>
        <p className="wf-intro">{doc.intro}</p>
        <div className="wf-legend">
          {(['gd', 'dev', 'qa', 'all'] as RoleKey[]).map((r) => (
            <span key={r} className="wf-legend-item">
              <span className={`wf-swatch ${ROLE_CLASS[r]}`} />
              {ROLE_META[r].short} — {ROLE_META[r].label}
            </span>
          ))}
        </div>
      </div>

      <h3 className="wf-h">Luồng thực hiện</h3>
      <div className="wf-flow">
        {doc.steps.map((s, i) => (
          <div key={s.n} className="wf-step-wrap">
            <div className={`wf-step ${stepRoleClass(s)}`}>
              <span className="wf-step-num">{s.n}</span>
              <div className="wf-step-body">
                <div className="wf-step-tags">
                  {s.roles.map((r) => (
                    <span key={r} className={`wf-rolechip ${ROLE_CLASS[r]}`}>{ROLE_META[r].short}</span>
                  ))}
                  {s.parallelWith && <span className="wf-parallel">⇄ song song bước {s.parallelWith}</span>}
                </div>
                <div className="wf-step-title">{s.title}</div>
                {s.detail && <div className="wf-step-detail">{s.detail}</div>}
              </div>
            </div>
            {i < doc.steps.length - 1 && <div className="wf-arrow" aria-hidden>↓</div>}
          </div>
        ))}
      </div>

      <h3 className="wf-h">Điều kiện “Done”</h3>
      <div className="glass section wf-donecard">
        <p className="wf-done-lead">Một task/feature chỉ được tính <strong>“Done”</strong> khi:</p>
        <Checklist items={doc.doneWhen} />
      </div>

      <h3 className="wf-h">Definition of Done theo vai trò</h3>
      <div className="wf-dod-grid">
        {doc.dod.map((g) => (
          <DodCard key={g.role} group={g} />
        ))}
      </div>
    </>
  );
}

function DodCard({ group }: { group: DodGroup }) {
  return (
    <div className={`glass wf-dod ${ROLE_CLASS[group.role]}`}>
      <div className="wf-dod-head">
        <span className={`wf-rolechip ${ROLE_CLASS[group.role]}`}>{ROLE_META[group.role].short}</span>
        {group.title}
      </div>
      <Checklist items={group.items} />
    </div>
  );
}

function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="wf-checklist">
      {items.map((it, i) => (
        <li key={i}><span className="wf-check" aria-hidden>✓</span><span>{it}</span></li>
      ))}
    </ul>
  );
}
