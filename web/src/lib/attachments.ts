// Attachment helpers: detect the provider from a URL (for the card icon), and
// upload reference images to Supabase Storage.

import { supabase } from '../supabase';
import type { Attachment } from '../types';

const BUCKET = 'attachments';

export const PROVIDERS: Record<string, { label: string; icon: string }> = {
  drive: { label: 'Google Drive', icon: '📁' },
  discord: { label: 'Discord', icon: '💬' },
  notion: { label: 'Notion', icon: '📝' },
  figma: { label: 'Figma', icon: '🎨' },
  github: { label: 'GitHub', icon: '🐙' },
  dropbox: { label: 'Dropbox', icon: '📦' },
  onedrive: { label: 'OneDrive', icon: '☁️' },
  youtube: { label: 'YouTube', icon: '▶️' },
  image: { label: 'Ảnh', icon: '🖼️' },
  link: { label: 'Website', icon: '🔗' },
};

export function providerMeta(provider: string) {
  return PROVIDERS[provider] ?? PROVIDERS.link;
}

/** Guess the provider from a URL so the card shows the right app icon. */
export function detectProvider(url: string): string {
  const u = url.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?|#|$)/.test(u)) return 'image';
  if (u.includes('drive.google') || u.includes('docs.google')) return 'drive';
  if (u.includes('discord.com') || u.includes('discord.gg') || u.includes('discordapp')) return 'discord';
  if (u.includes('notion.so') || u.includes('notion.site')) return 'notion';
  if (u.includes('figma.com')) return 'figma';
  if (u.includes('github.com')) return 'github';
  if (u.includes('dropbox.com')) return 'dropbox';
  if (u.includes('1drv.ms') || u.includes('onedrive.live')) return 'onedrive';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  return 'link';
}

/** "drive.google.com" — shown as the card subtitle under the attachment name. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** A short human label for a URL (host + trimmed path) when the user gives none. */
export function defaultName(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 40);
  }
}

function uid(): string {
  // crypto.randomUUID is available in all modern browsers.
  return crypto.randomUUID();
}

export function makeLinkAttachment(url: string, name?: string): Attachment {
  const provider = detectProvider(url);
  return {
    id: uid(),
    kind: provider === 'image' ? 'image' : 'link',
    url: url.trim(),
    name: (name || '').trim() || defaultName(url),
    provider,
  };
}

/** Upload an image file to Storage and return an image attachment. Throws on failure. */
export async function uploadImageAttachment(file: File): Promise<Attachment> {
  const id = uid();
  const path = `task-attachments/${id}-${file.name.replace(/[^\w.-]/g, '_')}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { id, kind: 'image', url: data.publicUrl, name: file.name, provider: 'image', storagePath: path };
}

/** Best-effort delete of an uploaded image's underlying Storage object. */
export async function deleteAttachmentFile(att: Attachment): Promise<void> {
  if (!att.storagePath) return;
  const { error } = await supabase.storage.from(BUCKET).remove([att.storagePath]);
  if (error) console.warn('Could not delete storage object', att.storagePath, error);
}
