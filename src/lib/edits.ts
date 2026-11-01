import { assembleMarkdown, type ClipResult } from './clip';
import { pruneImages } from './images';

export interface Edits {
  title?: string;
  author?: string;
  published?: string;
  /** Bearbeiteter Markdown-Body (ohne Frontmatter). */
  body?: string;
}

/** Übernimmt Änderungen aus dem Editor; leere Metadaten-Felder entfernen den Eintrag. */
export function applyEdits<T extends ClipResult>(payload: T, edits: Edits): T {
  const meta = { ...payload.meta };
  const set = (key: 'title' | 'author' | 'published', value: string | undefined) => {
    if (value === undefined) return;
    const trimmed = value.trim();
    if (trimmed) meta[key] = trimmed;
    else delete meta[key];
  };
  set('title', edits.title);
  set('author', edits.author);
  set('published', edits.published);
  const title = meta.title ?? payload.title;
  const body = edits.body ?? payload.body;
  // Gelöschte Bilder nicht mehr herunterladen
  const images = edits.body === undefined ? payload.images : pruneImages(body, payload.images);
  return { ...payload, meta, title, body, images, markdown: assembleMarkdown(meta, body) };
}
