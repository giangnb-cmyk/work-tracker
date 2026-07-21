import { useRef, useState } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';

interface Props {
  value: string;
  onChange: (emoji: string) => void;
  disabled?: boolean;
}

/**
 * Bộ emoji gợi ý cho icon feature/dự án — game, kinh tế, sự kiện, UI, media… Không cần đủ
 * mọi emoji: ô "gõ emoji khác" trong panel cho phép dán bất kỳ ký tự nào.
 */
const EMOJIS = [
  '🧩', '🎮', '🕹️', '🎯', '🎲', '🃏', '🎰', '🏆', '🥇', '👑', '⭐', '🌟', '✨', '💫', '🔥', '⚡',
  '💥', '💎', '💰', '🪙', '🛒', '🏬', '🏪', '🛍️', '🎁', '🎀', '📦', '🎫', '🎟️', '🏷️', '💳', '🧾',
  '📈', '📊', '📉', '🗓️', '⏰', '⏳', '🔔', '📣', '📢', '💬', '💡', '🔧', '🔨', '🛠️', '⚙️', '🧰',
  '🧪', '🔬', '🚀', '🛸', '🌈', '🎨', '🖌️', '🖼️', '🎭', '🎬', '🎥', '📷', '🎵', '🎶', '🔊', '🍔',
  '🍰', '🍪', '🍩', '🍕', '🍽️', '🧑‍🍳', '🌱', '🌸', '🌺', '🌼', '🌴', '🏡', '🏰', '🗺️', '🧭', '🎪',
  '🎢', '🐣', '🦄', '🐉', '🎉', '🎊', '❤️', '🧡', '💛', '💚', '💙', '💜', '🔒', '🔑', '🛡️', '⚔️',
];

/**
 * Ô chọn icon: bấm mở panel lưới emoji để chọn (hoặc gõ emoji tuỳ ý). Panel nổi đè
 * (overlay) — field icon nằm đầu modal nên thả xuống không bị vùng cuộn cắt, mà cũng
 * không xô cả form như kiểu in-flow.
 */
export default function EmojiPicker({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useClickOutside(wrapRef, () => setOpen(false), open);

  function pick(emoji: string) {
    onChange(emoji);
    setOpen(false);
  }

  return (
    <div className="emoji-wrap" ref={wrapRef}>
      <button
        type="button"
        className="input emoji-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-label="Chọn icon"
      >
        <span className="emoji-current">{value || '🧩'}</span>
        <span className="ss-caret">▾</span>
      </button>

      {open && (
        <div className="emoji-pop glass">
          <input
            className="input emoji-custom"
            value={value}
            maxLength={2}
            placeholder="Gõ emoji khác…"
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="emoji-grid">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className={`emoji-cell${e === value ? ' selected' : ''}`}
                onClick={() => pick(e)}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
