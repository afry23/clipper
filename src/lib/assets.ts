import type { ImageRef } from './images';

export interface FetchedImage {
  name: string;
  bytes: Uint8Array;
  mime: string;
}

export interface ImageOutcome {
  saved: Map<string, FetchedImage>; // Token → Datei
  failed: { url: string; reason: string }[];
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
};

export function extensionFor(mime: string, url: string): string {
  const fromMime = MIME_EXT[mime.split(';')[0].trim().toLowerCase()];
  if (fromMime) return fromMime;
  try {
    const match = /\.([a-z0-9]{2,5})$/i.exec(new URL(url).pathname);
    if (match) return match[1].toLowerCase();
  } catch {
    /* data:-URLs etc. */
  }
  return 'img';
}

async function hashName(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)]
    .slice(0, 6)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

async function fetchOnce(url: string, fetchFn: FetchFn, timeoutMs: number): Promise<{ bytes: Uint8Array; mime: string }> {
  const response = await fetchFn(url, { credentials: 'include', signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const mime = response.headers.get('content-type') ?? '';
  if (mime && !mime.startsWith('image/') && !mime.startsWith('application/octet-stream')) {
    throw new Error(`kein Bild (${mime})`);
  }
  return { bytes: new Uint8Array(await response.arrayBuffer()), mime };
}

async function fetchImage(url: string, fetchFn: FetchFn, timeoutMs: number): Promise<{ bytes: Uint8Array; mime: string }> {
  try {
    return await fetchOnce(url, fetchFn, timeoutMs);
  } catch {
    return await fetchOnce(url, fetchFn, timeoutMs); // 1× Retry
  }
}

export interface DownloadOptions {
  fetchFn?: FetchFn;
  concurrency?: number;
  timeoutMs?: number;
}

/** Lädt alle Bilder (parallel begrenzt). Einzelne Fehler brechen nicht ab; identische Inhalte teilen sich eine Datei. */
export async function downloadImages(images: ImageRef[], options: DownloadOptions = {}): Promise<ImageOutcome> {
  const { fetchFn = fetch, concurrency = 6, timeoutMs = 15_000 } = options;
  const outcome: ImageOutcome = { saved: new Map(), failed: [] };
  const byName = new Map<string, FetchedImage>();
  let next = 0;

  async function worker(): Promise<void> {
    while (next < images.length) {
      const image = images[next++];
      try {
        const { bytes, mime } = await fetchImage(image.url, fetchFn, timeoutMs);
        if (bytes.length === 0) throw new Error('leere Antwort');
        const name = `${await hashName(bytes)}.${extensionFor(mime, image.url)}`;
        const file = byName.get(name) ?? { name, bytes, mime };
        byName.set(name, file);
        outcome.saved.set(image.token, file);
      } catch (error) {
        outcome.failed.push({ url: image.url, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, images.length) }, worker));
  return outcome;
}

/** Ersetzt Tokens durch `assets/<name>`; fehlgeschlagene Bilder behalten die Original-URL. */
export function rewriteMarkdown(markdown: string, images: ImageRef[], outcome: ImageOutcome | undefined): string {
  // Längere Tokens zuerst, damit `clipper-img:1` nicht in `clipper-img:10` greift
  const sorted = [...images].sort((a, b) => b.token.length - a.token.length);
  let result = markdown;
  for (const image of sorted) {
    const file = outcome?.saved.get(image.token);
    result = result.split(image.token).join(file ? `assets/${file.name}` : image.url);
  }
  return result;
}
