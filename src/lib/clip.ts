import { Readability } from '@mozilla/readability';
import { buildFrontmatter } from './frontmatter';
import { htmlToMarkdown } from './markdown';
import { resolveImages, tokenizeImages, type ImageRef } from './images';
import { extractMeta } from './meta';
import { stripPageChrome, type PageInput } from './pagination';
import { slugify } from './slug';

/** Löst relative Links gegen die Seiten-URL auf; DOMParser-Dokumente (spätere Folgeseiten) kennen keine baseURI. */
function absolutizeLinks(doc: Document, url: string): void {
  const baseHref = doc.querySelector('base[href]')?.getAttribute('href');
  const base = baseHref ? new URL(baseHref, url).href : url;
  for (const a of doc.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href')!;
    if (href.startsWith('#')) continue; // Anker im Artikel bleiben relativ
    try {
      a.setAttribute('href', new URL(href, base).href);
    } catch {
      /* ungültige URL unverändert lassen */
    }
  }
}

/** Entfernt ein angehängtes " | Seitenname" aus dem Titel. */
function stripSiteSuffix(title: string, site?: string): string {
  if (!site) return title;
  const escaped = site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return title.replace(new RegExp(`\\s*[|\\-–—:·]\\s*${escaped}$`, 'i'), '') || title;
}

export interface ClipResult {
  folder: string;
  markdown: string;
  title: string;
  /** Bilder im Markdown, referenziert über Tokens (`clipper-img:N`). */
  images: ImageRef[];
  /** Hinweise zu übersprungenen oder unvollständigen Seiten. */
  warnings: string[];
}

interface Extracted {
  title?: string;
  byline?: string;
  content: string;
}

/** Hauptinhalt einer Seite per Readability; arbeitet auf einem Klon. */
function extractPage({ doc, url }: PageInput): Extracted | null {
  const clone = doc.cloneNode(true) as Document;
  absolutizeLinks(clone, url);
  resolveImages(clone, url);
  const article = new Readability(clone).parse();
  if (!article?.content) return null;
  return { title: article.title?.trim() || undefined, byline: article.byline?.trim() || undefined, content: article.content };
}

/**
 * Fügt die Artikel aller Seiten zu einem Markdown-Dokument zusammen.
 * Metadaten stammen aus `metaDoc` (der ursprünglich geöffneten Seite).
 */
export function clipPages(pages: PageInput[], metaDoc: Document, metaUrl: string, now = new Date()): ClipResult {
  const meta = extractMeta(metaDoc, metaUrl);
  const warnings: string[] = [];
  const container = metaDoc.implementation.createHTMLDocument('').body;

  let title: string | undefined;
  let byline: string | undefined;
  let merged = 0;
  for (const [index, page] of pages.entries()) {
    const extracted = extractPage(page);
    if (!extracted) {
      if (index === 0) throw new Error('Kein Artikelinhalt gefunden');
      warnings.push(`Seite ${index + 1} (${page.url}): kein Artikelinhalt gefunden, übersprungen`);
      continue;
    }
    if (merged === 0) {
      title = stripSiteSuffix(extracted.title || meta.title || new URL(metaUrl).hostname, meta.site);
      byline = extracted.byline;
    }
    const part = metaDoc.implementation.createHTMLDocument('').body;
    part.innerHTML = extracted.content;
    stripPageChrome(part, title, merged > 0);
    container.append(...part.childNodes);
    merged++;
  }

  const images = tokenizeImages(container);
  const body = htmlToMarkdown(container.innerHTML);
  const frontmatter = buildFrontmatter({
    ...meta,
    title,
    author: meta.author ?? byline,
    clipped: now.toISOString(),
    pages: pages.length,
  });
  const heading = body.startsWith('# ') ? '' : `# ${title}\n\n`;
  const date = now.toISOString().slice(0, 10);
  return { folder: `${date}-${slugify(title!)}`, markdown: `${frontmatter}\n${heading}${body}`, title: title!, images, warnings };
}

/** Wandelt ein einzelnes Dokument in Markdown um. Das Dokument wird nicht verändert (Klon). */
export function clipDocument(doc: Document, url: string, now = new Date()): ClipResult {
  return clipPages([{ doc, url }], doc, url, now);
}
