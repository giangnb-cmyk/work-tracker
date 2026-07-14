import { initials } from '../lib/format';

interface AvatarProps {
  name: string;
  photoURL?: string;
  size?: 'sm' | 'md';
}

/** Circular avatar: shows the photo when available, otherwise initials. */
export default function Avatar({ name, photoURL, size = 'md' }: AvatarProps) {
  const cls = `avatar${size === 'sm' ? ' sm' : ''}`;
  if (photoURL) return <img className={cls} src={photoURL} alt={name} referrerPolicy="no-referrer" />;
  return <span className={cls} title={name}>{initials(name)}</span>;
}
