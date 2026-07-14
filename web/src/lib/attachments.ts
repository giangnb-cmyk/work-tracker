// Attachment helpers: detect the provider from a URL (for the card icon), and
// upload reference images to Firebase Storage.

import { getDownloadURL, ref, uploadBytes, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';
import type { Attachment } from '../types';

export const PROVIDERS: Record<string, { label: string; icon: string }> = {
  drive: { label: 'Google Drive', icon: '📁' },
  discord: { label: 'Discord', icon: '💬' },
  notion: { label: 'Notion', icon: '📝' },
  figma: { label: 'Figma', icon: '🎨' },
  github: { label: 'GitHub', icon: '🐙' },
  image: { label: 'Ảnh', icon: '🖼️' },
  link: { label: 'Link', icon: '🔗' },
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
  return 'link';
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
  const r = ref(storage, path);
  await uploadBytes(r, file, { contentType: file.type });
  const url = await getDownloadURL(r);
  return { id, kind: 'image', url, name: file.name, provider: 'image', storagePath: path };
}

/** Best-effort delete of an uploaded image's underlying Storage object. */
export async function deleteAttachmentFile(att: Attachment): Promise<void> {
  if (!att.storagePath) return;
  try {
    await deleteObject(ref(storage, att.storagePath));
  } catch (err) {
    console.warn('Could not delete storage object', att.storagePath, err);
  }
}
