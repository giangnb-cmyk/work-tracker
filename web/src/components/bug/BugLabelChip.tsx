import type { CSSProperties } from 'react';

/** Minimal shape a chip needs — BugLabel lẫn FeatureLabel đều thoả. */
export interface ChipLabel {
  name: string;
  color: string;
  icon: string;
}

interface Props {
  label: ChipLabel;
  onRemove?: () => void;
  onClick?: () => void;
  active?: boolean; // for the toggle picker (dim when not selected)
  small?: boolean;
}

/** A colored bug tag pill. Tint + border derive from the label's color. */
export default function BugLabelChip({ label, onRemove, onClick, active = true, small }: Props) {
  const style = { '--chip': label.color } as CSSProperties;
  return (
    <span
      className={`bug-chip${small ? ' sm' : ''}${active ? '' : ' off'}${onClick ? ' clickable' : ''}`}
      style={style}
      onClick={onClick}
    >
      {label.icon && (label.icon.startsWith('http')
        ? <img className="bug-chip-img" src={label.icon} alt="" aria-hidden />
        : <span className="bug-chip-ic" aria-hidden>{label.icon}</span>)}
      {label.name}
      {onRemove && (
        <button
          type="button"
          className="bug-chip-x"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label="Bỏ nhãn"
        >
          ×
        </button>
      )}
    </span>
  );
}
