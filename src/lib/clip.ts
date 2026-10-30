import { Readability } from '@mozilla/readability';
import { buildFrontmatter } from './frontmatter';
import { htmlToMarkdown } from './markdown';
import { resolveImages, tokenizeImages, type ImageRef } from './images';
import { extractMeta } from './meta';
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
}

/** Wandelt ein Dokument in Markdown um. Das Dokument wird nicht verändert (Klon). */
export function clipDocument(doc: Document, url: string, now = new Date()): ClipResult {
  const meta = extractMeta(doc, url);
  const clone = doc.cloneNode(true) as Document;
  absolutizeLinks(clone, url);
  resolveImages(clone, url);
  const article = new Readability(clone).parse();
  if (!article?.content) throw new Error('Kein Artikelinhalt gefunden');

  const title = stripSiteSuffix(article.title?.trim() || meta.title || new URL(url).hostname, meta.site);
  const container = doc.implementation.createHTMLDocument('').body;
  container.innerHTML = article.content;
  const images = tokenizeImages(container);
  const body = htmlToMarkdown(container.innerHTML);
  const frontmatter = buildFrontmatter({
    ...meta,
    title,
    author: meta.author ?? (article.byline?.trim() || undefined),
    clipped: now.toISOString(),
  });
  const heading = body.startsWith('# ') ? '' : `# ${title}\n\n`;
  const date = now.toISOString().slice(0, 10);
  return { folder: `${date}-${slugify(title)}`, markdown: `${frontmatter}\n${heading}${body}`, title, images };
}
