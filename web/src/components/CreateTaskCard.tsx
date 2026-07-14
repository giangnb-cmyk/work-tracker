interface Props {
  onClick: () => void;
  label?: string;
}

/** Empty "+" tile placed first in a task list — the primary way to create a task. */
export default function CreateTaskCard({ onClick, label = 'Tạo task mới' }: Props) {
  return (
    <button type="button" className="tcard-new" onClick={onClick}>
      <span className="tcard-new-plus" aria-hidden>＋</span>
      <span className="tcard-new-label">{label}</span>
    </button>
  );
}
