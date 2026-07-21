// Dữ liệu quy trình làm việc (tab "Quy trình"). Tách khỏi component để về sau thêm quy
// trình của các bộ phận khác chỉ cần bổ sung một mục vào WORKFLOWS — không đụng UI.

/** Vai trò tham gia một bước / một mục DoD. Dùng cho màu và nhãn. */
export type RoleKey = 'gd' | 'dev' | 'qa' | 'all';

export const ROLE_META: Record<RoleKey, { label: string; short: string }> = {
  gd: { label: 'Game Designer', short: 'GD' },
  dev: { label: 'Developer', short: 'Dev' },
  qa: { label: 'QA', short: 'QA' },
  all: { label: 'Liên phòng', short: 'GD·Dev·QA' },
};

export interface WorkflowStep {
  n: number;
  roles: RoleKey[];
  title: string;
  detail?: string;
  /** Bước chạy SONG SONG với bước n này (không phải nối tiếp). */
  parallelWith?: number;
}

export interface DodGroup {
  role: RoleKey;
  title: string;
  items: string[];
}

export interface WorkflowDoc {
  id: string;
  title: string;
  scope: string;
  intro: string;
  steps: WorkflowStep[];
  /** Điều kiện tổng để một task/feature được tính "Done". */
  doneWhen: string[];
  /** DoD chi tiết theo từng vai trò. */
  dod: DodGroup[];
}

const FEATURE_THO: WorkflowDoc = {
  id: 'feature-tho',
  title: 'Quy trình làm một tính năng (bản thô)',
  scope: 'Dev · GD · QA — CHƯA bao gồm anim, VFX, sound',
  intro:
    'Luồng phối hợp giữa GD, Dev và QA để đưa một tính năng từ ý tưởng tới release. Đây là ' +
    'bản “thô” tập trung vào gameplay/logic; các khâu anim, VFX, sound sẽ bổ sung ở quy trình riêng.',
  steps: [
    { n: 1, roles: ['gd'], title: 'GD viết Design Doc' },
    { n: 2, roles: ['all'], title: 'Review liên phòng (GD + Dev + QA)', detail: 'Chốt scope, ước lượng effort.' },
    { n: 3, roles: ['dev'], title: 'Dev break task → estimate → đưa vào sprint backlog' },
    { n: 4, roles: ['dev'], title: 'Dev implement → tạo build / branch feature' },
    { n: 5, roles: ['qa'], title: 'QA viết test case dựa trên Design Doc', detail: 'Làm song song với bước 4.', parallelWith: 4 },
    { n: 6, roles: ['dev'], title: 'Internal test / smoke test', detail: 'Dev tự test trước khi handoff.' },
    { n: 7, roles: ['qa'], title: 'QA test chính thức trên build → log bug', detail: 'Ghi bug lên Jira / Trello / Sheet.' },
    { n: 8, roles: ['dev', 'qa'], title: 'Dev fix bug → QA retest', detail: 'Regression vòng quanh bug đã fix.' },
    { n: 9, roles: ['gd'], title: 'GD review lại gameplay / balance thực tế trên build' },
    { n: 10, roles: ['all'], title: 'Sign-off → merge vào main / release branch' },
    { n: 11, roles: ['dev'], title: 'Release', detail: 'Staged rollout / TestFlight / Internal Testing track.' },
    { n: 12, roles: ['gd', 'dev', 'qa'], title: 'Theo dõi số liệu sau release', detail: 'GD theo dõi số liệu; Dev + QA hotfix nếu cần.' },
  ],
  doneWhen: [
    'Code đã merge, pass CI (build + lint).',
    'Dev tự test smoke case chính.',
    'QA test đủ test case, không còn bug Blocker / Critical / Major mở.',
    'GD xác nhận đúng thiết kế & balance.',
    'Tracking event đã verify bắn đúng (nếu có).',
    'Không phát sinh regression ở tính năng liên quan.',
  ],
  dod: [
    {
      role: 'gd',
      title: 'DoD của GD (Game Designer)',
      items: [
        'Design doc đã hoàn chỉnh đủ 7 mục (mục tiêu, gameplay, số liệu, điều kiện mở khóa, tracking, out-of-scope, acceptance criteria).',
        'Đã review design doc cùng Dev + QA, chốt scope, không còn câu hỏi mở (open question).',
        'Bảng số liệu / balance (cost, reward, drop rate, curve…) đã điền đủ, không còn ô “TBD”.',
        'Đã cung cấp đủ asset reference / wireframe cho Dev bám theo (không bắt Dev tự đoán UI).',
        'Đã định nghĩa rõ các case đặc biệt (first time user, edge case số liệu âm/0, max level…).',
        'Sau khi build ra, đã tự chơi thử và xác nhận đúng ý đồ thiết kế (không chỉ đọc code/spec suông).',
        'Đã kiểm tra tracking event bắn đúng ngữ nghĩa (không chỉ đúng kỹ thuật mà đúng mục đích phân tích).',
        'Sign-off chính thức (comment/approve trên ticket) trước khi cho release.',
      ],
    },
    {
      role: 'dev',
      title: 'DoD của Dev (Developer)',
      items: [
        'Code implement đúng theo design doc; phần nào lệch / không khả thi đã trao đổi lại với GD và thống nhất bằng văn bản.',
        'Code đã tự review (self-review) hoặc qua code review với dev khác nếu team có quy trình đó.',
        'Build pass CI (compile/build Android + iOS không lỗi), pass lint / static check.',
        'Đã tự test smoke case chính (happy path) trước khi handoff cho QA — không đẩy bug hiển nhiên sang QA.',
        'Không có warning / error nghiêm trọng trong log khi chạy tính năng.',
        'Đã implement đủ tracking event theo spec của GD, tự verify bằng debug log / tool (VD Firebase DebugView).',
        'Performance chấp nhận được (không giật lag rõ rệt, không leak memory rõ rệt) trên thiết bị test thực tế.',
        'Đã merge code đúng nhánh quy ước (feature/* → develop), có mô tả commit / MR rõ ràng.',
        'Đã fix hết bug Blocker / Critical / Major do QA report, và QA đã retest pass.',
      ],
    },
    {
      role: 'qa',
      title: 'DoD của QA',
      items: [
        'Test case đã viết đầy đủ dựa trên design doc + acceptance criteria (không test theo cảm tính).',
        'Đã test đủ các case: happy path, edge case, negative case (input sai, mất mạng, thoát app giữa chừng…).',
        'Đã test trên tối thiểu bộ thiết bị / OS đại diện đã thống nhất với team (VD: 1 Android low-end, 1 flagship, 1 iOS).',
        'Đã test regression các tính năng liên quan (không chỉ test tính năng mới đơn lẻ).',
        'Mọi bug tìm được đã được log đầy đủ theo chuẩn (steps, expected/actual, severity, evidence).',
        'Không còn bug Blocker / Critical / Major ở trạng thái mở.',
        'Đã verify tracking event bắn đúng số lượng / tham số qua tool debug (không chỉ tin lời Dev).',
        'Đã ký xác nhận (sign-off) sẵn sàng release trên ticket / checklist release.',
      ],
    },
  ],
};

/** Danh sách quy trình. Thêm quy trình bộ phận khác thì bổ sung vào đây. */
export const WORKFLOWS: WorkflowDoc[] = [FEATURE_THO];
