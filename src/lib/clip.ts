import { Readability } from '@mozilla/readability';
import { buildFrontmatter, type FrontmatterInput } from './frontmatter';
import { htmlToMarkdown } from './markdown';
import { resolveImages, tokenizeImages, type ImageRef } from './images';
import { extractMeta, type ArticleMeta } from './meta';
import { stripPageChrome, type PageInput } from './pagination';

/** Löst relative Links gegen die Seiten-URL auf; DOMParser-Dokumente (spätere Folgeseiten) kennen keine baseURI. */
function absolutizeLinks(root: ParentNode, url: string, baseHref?: string | null): void {
  const base = baseHref ? new URL(baseHref, url).href : url;
  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href')!;
    if (href.startsWith('#')) continue; // Anker im Artikel bleiben relativ
    try {
      a.setAttribute('href', new URL(href, base).href);
    } catch {
      /* ungültige URL unverändert lassen */
    }
  }
}

/**
 * Werbeblöcke und Video-Player, die Readability als Artikelinhalt durchlässt (z. B. heise: `div.ad.ad--inread`
 * mit `<a-video>`). Bewusst eng gefasst, damit echte Inhalte nicht verloren gehen.
 */
export const AD_SELECTOR = [
  '.ad',
  '[class*="ad--"]',
  '[class*="ad-label" i]',
  '[class*="advert" i]',
  '[id^="ad-"]',
  '[id*="advert" i]',
  '[data-ad]',
  '[aria-label*="werbung" i]',
  '[aria-label*="advertisement" i]',
  'a-video',
  'ins.adsbygoogle',
].join(',');

export function stripAds(root: ParentNode): void {
  for (const el of root.querySelectorAll(AD_SELECTOR)) {
    // Nie einen Container entfernen, der den eigentlichen Artikel enthält
    if (el.matches('html, body') || el.querySelector('article, main')) continue;
    el.remove();
  }
}

/** Hängt das Titelbild vorn an, falls der Artikel nicht schon vor dem ersten Absatz ein Bild hat. */
export function addLeadImage(container: Element, imageUrl: string | undefined, alt = ''): void {
  if (!imageUrl) return;
  const firstParagraph = container.querySelector('p');
  for (const img of container.querySelectorAll('img')) {
    const before = !firstParagraph || !!(img.compareDocumentPosition(firstParagraph) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (before) return;
  }
  const img = container.ownerDocument.createElement('img');
  img.setAttribute('src', imageUrl);
  if (alt) img.setAttribute('alt', alt);
  const wrapper = container.ownerDocument.createElement('p');
  wrapper.append(img);
  container.prepend(wrapper);
}

/** Entfernt ein angehängtes " | Seitenname" aus dem Titel. */
function stripSiteSuffix(title: string, site?: string): string {
  if (!site) return title;
  const escaped = site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return title.replace(new RegExp(`\\s*[|\\-–—:·]\\s*${escaped}$`, 'i'), '') || title;
}

export interface ClipResult {
  /** Frontmatter-Daten; die Vorschau darf Titel, Autor und Datum ändern. */
  meta: FrontmatterInput;
  /** Markdown ohne Frontmatter und ohne Titelüberschrift. */
  body: string;
  /** Fertiges Dokument aus `meta` und `body`. */
  markdown: string;
  title: string;
  /** Bilder im Markdown, referenziert über Tokens (`clipper-img:N`). */
  images: ImageRef[];
  /** Hinweise zu übersprungenen oder unvollständigen Seiten. */
  warnings: string[];
  /** Nur der markierte Bereich wurde gesichert. */
  selection?: boolean;
}

/** Setzt Frontmatter, Titelüberschrift und Body zusammen. */
export function assembleMarkdown(meta: FrontmatterInput, body: string): string {
  const heading = body.startsWith('# ') || !meta.title ? '' : `# ${meta.title}\n\n`;
  return `${buildFrontmatter(meta)}\n${heading}${body}`;
}

function buildResult(
  container: Element,
  meta: ArticleMeta,
  title: string,
  byline: string | undefined,
  pages: number,
  now: Date,
  warnings: string[],
  selection?: boolean,
): ClipResult {
  const images = tokenizeImages(container);
  const body = htmlToMarkdown(container.innerHTML);
  const frontmatter: FrontmatterInput = {
    ...meta,
    title,
    author: meta.author ?? byline,
    clipped: now.toISOString(),
    pages,
  };
  return { meta: frontmatter, body, markdown: assembleMarkdown(frontmatter, body), title, images, warnings, selection };
}

interface Extracted {
  title?: string;
  byline?: string;
  content: string;
}

/** Hauptinhalt einer Seite per Readability; arbeitet auf einem Klon. */
function extractPage({ doc, url }: PageInput): Extracted | null {
  const clone = doc.cloneNode(true) as Document;
  absolutizeLinks(clone, url, clone.querySelector('base[href]')?.getAttribute('href'));
  resolveImages(clone, url);
  stripAds(clone);
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

  addLeadImage(container, meta.image);
  return buildResult(container, meta, title!, byline, pages.length, now, warnings);
}

/** Wandelt ein einzelnes Dokument in Markdown um. Das Dokument wird nicht verändert (Klon). */
export function clipDocument(doc: Document, url: string, now = new Date()): ClipResult {
  return clipPages([{ doc, url }], doc, url, now);
}

/** Sichert nur einen markierten Bereich (HTML-Fragment) statt des Readability-Artikels. */
export function clipSelection(html: string, metaDoc: Document, metaUrl: string, now = new Date()): ClipResult {
  const meta = extractMeta(metaDoc, metaUrl);
  const container = metaDoc.implementation.createHTMLDocument('').body;
  container.innerHTML = html;
  absolutizeLinks(container, metaUrl, metaDoc.querySelector('base[href]')?.getAttribute('href'));
  resolveImages(container, metaUrl);
  if (!(container.textContent ?? '').trim() && !container.querySelector('img')) throw new Error('Keine Auswahl');
  const title = stripSiteSuffix(meta.title || new URL(metaUrl).hostname, meta.site);
  return buildResult(container, meta, title, undefined, 1, now, [], true);
}
