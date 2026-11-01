export interface ArticleMeta {
  title?: string;
  author?: string;
  published?: string;
  site?: string;
  description?: string;
  /** Titelbild (og:image / twitter:image), absolut aufgelöst. */
  image?: string;
  source: string;
}

type JsonObject = Record<string, unknown>;

function metaContent(doc: Document, ...selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const value = doc.querySelector(selector)?.getAttribute('content')?.trim();
    if (value) return value;
  }
  return undefined;
}

function absoluteUrl(value: string | undefined, base: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, base);
    return /^https?:$/.test(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function* walkJsonLd(node: unknown): Generator<JsonObject> {
  if (Array.isArray(node)) {
    for (const item of node) yield* walkJsonLd(item);
  } else if (node && typeof node === 'object') {
    const obj = node as JsonObject;
    yield obj;
    if (obj['@graph']) yield* walkJsonLd(obj['@graph']);
  }
}

function authorName(author: unknown): string | undefined {
  if (typeof author === 'string') return author.trim() || undefined;
  if (Array.isArray(author)) {
    const names = author.map(authorName).filter((n): n is string => !!n);
    return names.length ? names.join(', ') : undefined;
  }
  if (author && typeof author === 'object') return authorName((author as JsonObject).name);
  return undefined;
}

function fromJsonLd(doc: Document): { author?: string; published?: string } {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? '');
    } catch {
      continue;
    }
    for (const obj of walkJsonLd(data)) {
      const type = String(obj['@type'] ?? '');
      if (!/Article|BlogPosting|NewsArticle|Report/i.test(type)) continue;
      const author = authorName(obj.author);
      const published = typeof obj.datePublished === 'string' ? obj.datePublished : undefined;
      if (author || published) return { author, published };
    }
  }
  return {};
}

/** ISO-Datum (YYYY-MM-DD bei reinem Datum, sonst voller Zeitstempel); unparsebare Werte werden verworfen. */
export function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function extractMeta(doc: Document, url: string): ArticleMeta {
  const ld = fromJsonLd(doc);
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
  let source = url;
  if (canonical) {
    try {
      source = new URL(canonical, url).href;
    } catch {
      /* ungültiges canonical ignorieren */
    }
  }
  return {
    title: metaContent(doc, 'meta[property="og:title"]', 'meta[name="twitter:title"]') ?? (doc.title.trim() || undefined),
    author:
      ld.author ??
      metaContent(doc, 'meta[name="author"]', 'meta[property="article:author"]', 'meta[name="parsely-author"]'),
    published: normalizeDate(
      ld.published ??
        metaContent(doc, 'meta[property="article:published_time"]', 'meta[name="date"]', 'meta[itemprop="datePublished"]') ??
        doc.querySelector('time[datetime]')?.getAttribute('datetime') ??
        undefined,
    ),
    site: metaContent(doc, 'meta[property="og:site_name"]'),
    description: metaContent(doc, 'meta[property="og:description"]', 'meta[name="description"]'),
    image: absoluteUrl(metaContent(doc, 'meta[property="og:image"]', 'meta[name="twitter:image"]'), url),
    source,
  };
}
