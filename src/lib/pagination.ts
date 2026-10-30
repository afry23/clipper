export interface PageInput {
  doc: Document;
  url: string;
}

export const PAGER_SELECTOR = [
  '[class*="pagination" i]',
  '[class*="pager" i]',
  '[id*="pagination" i]',
  '[id*="pager" i]',
  '[class*="page-nav" i]',
  '[class*="pagenav" i]',
  'nav[aria-label*="page" i]',
  'nav[aria-label*="seite" i]',
].join(',');

const NEXT_TEXT = /^\s*(?:next(?:\s+page)?|weiter|nächste(?:\s+seite)?|naechste(?:\s+seite)?|(?:next|weiter)?\s*[»›→>]+)\s*$/i;
const SINGLE_PAGE_TEXT =
  /alle\s+seiten|auf\s+einer\s+seite|einseitig|ganzen\s+artikel|single[\s-]?page|view\s+all|all\s+pages|one\s+page|print\s+version|druckansicht|druckversion|printer[\s-]friendly/i;
const PAGE_INDICATOR = /^\s*(?:seite|page)\s+\d+\s*(?:von|of|\/)\s*\d+\s*$/i;
const PAGE_PARAMS = new Set(['page', 'p', 'seite', 'pg', 'paged', 'pagenumber', 'start', 'offset']);

/** URL ohne Hash, zum Vergleichen besuchter Seiten. */
export function pageKey(url: string): string {
  const u = new URL(url);
  u.hash = '';
  return u.href;
}

/** Pfad ohne Seitennummer-Suffix und Dateiendung: `/a/artikel-2.html`, `/a/artikel/page/3` → `/a/artikel`. */
function pathStem(pathname: string): string {
  return pathname
    .replace(/\/+$/, '')
    .replace(/\.(?:html?|php|aspx?)$/i, '')
    .replace(/(?:\/|[-_])?(?:(?:part|teil|seite|page|p)[-_/]?)?\d+$/i, '')
    .replace(/\/(?:page|seite|p)$/i, '');
}

function otherParams(u: URL): string {
  return [...u.searchParams.entries()]
    .filter(([key]) => !PAGE_PARAMS.has(key.toLowerCase()))
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('&');
}

/** Gehören beide URLs zum selben (paginierten) Artikel? Gleicher Origin, gleicher Pfadstamm, gleiche Nicht-Seiten-Parameter. */
export function sameArticle(a: string, b: string): boolean {
  const ua = new URL(a);
  const ub = new URL(b);
  return ua.origin === ub.origin && pathStem(ua.pathname) === pathStem(ub.pathname) && otherParams(ua) === otherParams(ub);
}

function resolve(href: string | null | undefined, base: string): string | undefined {
  if (!href || /^(?:javascript|mailto|tel):/i.test(href.trim()) || href.trim().startsWith('#')) return undefined;
  try {
    const url = new URL(href, base);
    return /^https?:$/.test(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function labelOf(el: Element): string[] {
  return [el.textContent ?? '', el.getAttribute('aria-label') ?? '', el.getAttribute('title') ?? ''];
}

function numberedItems(container: Element, base: string): { n: number; url?: string; current: boolean }[] {
  const items: { n: number; url?: string; current: boolean }[] = [];
  for (const el of container.querySelectorAll('a, span, strong, b, em, li, button')) {
    const text = (el.textContent ?? '').trim();
    if (!/^\d{1,4}$/.test(text)) continue;
    if ([...el.children].some((child) => (child.textContent ?? '').trim() === text)) continue; // nur innerste Elemente
    const anchor = el.closest('a[href]');
    const url = resolve(anchor?.getAttribute('href'), base);
    const marked =
      !!el.closest('[aria-current]:not([aria-current="false"])') ||
      /\b(?:current|active|selected)\b/i.test(`${el.className} ${el.parentElement?.className ?? ''}`);
    items.push({ n: parseInt(text, 10), url, current: marked || !anchor });
  }
  return items;
}

/** Sucht den Link zur nächsten Seite. `firstUrl` ist die URL der ersten Seite des Artikels. */
export function findNextPageUrl(doc: Document, url: string, firstUrl = url): string | undefined {
  const here = pageKey(url);
  const accept = (candidate: string | undefined, trusted: boolean): string | undefined => {
    if (!candidate || pageKey(candidate) === here) return undefined;
    if (new URL(candidate).origin !== new URL(url).origin) return undefined;
    return trusted || sameArticle(candidate, firstUrl) ? candidate : undefined;
  };

  // 1. rel="next" (vom Autor ausdrücklich gesetzt)
  for (const el of doc.querySelectorAll('link[rel~="next" i][href], a[rel~="next" i][href]')) {
    const found = accept(resolve(el.getAttribute('href'), url), true);
    if (found) return found;
  }

  // 2. Pager-Container: "Weiter"-Link oder Seitenzahl current+1
  for (const container of doc.querySelectorAll(PAGER_SELECTOR)) {
    for (const a of container.querySelectorAll('a[href]')) {
      if (labelOf(a).some((label) => NEXT_TEXT.test(label))) {
        const found = accept(resolve(a.getAttribute('href'), url), false);
        if (found) return found;
      }
    }
    const items = numberedItems(container, url);
    const current = items.find((item) => item.current);
    if (current) {
      const next = items.find((item) => item.n === current.n + 1 && item.url);
      const found = accept(next?.url, false);
      if (found) return found;
    }
  }

  // 3. Beliebiger "Weiter"-Link außerhalb eines Pagers
  for (const a of doc.querySelectorAll('a[href]')) {
    if (labelOf(a).some((label) => NEXT_TEXT.test(label))) {
      const found = accept(resolve(a.getAttribute('href'), url), false);
      if (found) return found;
    }
  }
  return undefined;
}

/** Link zur Ein-Seiten-/Druckansicht desselben Artikels. */
export function findSinglePageUrl(doc: Document, url: string): string | undefined {
  for (const a of doc.querySelectorAll('a[href]')) {
    if (!labelOf(a).some((label) => SINGLE_PAGE_TEXT.test(label.trim()) && label.trim().length < 60)) continue;
    const candidate = resolve(a.getAttribute('href'), url);
    if (!candidate || pageKey(candidate) === pageKey(url)) continue;
    if (new URL(candidate).origin !== new URL(url).origin) continue;
    return candidate;
  }
  return undefined;
}

/** Entfernt Pager und "Seite x von y"-Zeilen sowie (ab Seite 2) die wiederholte Überschrift. */
export function stripPageChrome(container: Element, title: string | undefined, isFollowPage: boolean): void {
  for (const pager of container.querySelectorAll(PAGER_SELECTOR)) pager.remove();
  for (const el of container.querySelectorAll('p, div, span, li')) {
    const text = (el.textContent ?? '').trim();
    if (text.length < 40 && PAGE_INDICATOR.test(text)) el.remove();
  }
  if (isFollowPage && title) {
    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const first = container.querySelector('h1, h2');
    if (first && normalize(first.textContent ?? '') === normalize(title)) first.remove();
  }
}

export interface CollectOptions {
  maxPages: number;
  preferSinglePage: boolean;
  fetchPage: (url: string) => Promise<PageInput>;
  onProgress?: (pages: number) => void;
  isCancelled?: () => boolean;
}

export interface Collected {
  pages: PageInput[];
  warnings: string[];
}

/** Folgt "nächste Seite"-Links ab der ersten Seite. Zyklen, Limit, Abbruch und Ladefehler beenden die Suche mit Warnung. */
export async function collectPages(first: PageInput, options: CollectOptions): Promise<Collected> {
  const { maxPages, preferSinglePage, fetchPage, onProgress, isCancelled } = options;
  const warnings: string[] = [];
  const visited = new Set([pageKey(first.url)]);

  if (preferSinglePage && findNextPageUrl(first.doc, first.url)) {
    const singleUrl = findSinglePageUrl(first.doc, first.url);
    if (singleUrl) {
      try {
        const single = await fetchPage(singleUrl);
        onProgress?.(1);
        return { pages: [single], warnings };
      } catch (error) {
        warnings.push(`Ein-Seiten-Ansicht nicht ladbar (${errorText(error)}), lade Seiten einzeln`);
      }
    }
  }

  const pages = [first];
  onProgress?.(1);
  for (;;) {
    const current = pages[pages.length - 1];
    if (isCancelled?.()) {
      warnings.push(`Abgebrochen nach Seite ${pages.length}`);
      break;
    }
    const next = findNextPageUrl(current.doc, current.url, first.url);
    if (!next) break;
    if (visited.has(pageKey(next))) {
      warnings.push(`Seitenschleife bei ${next} erkannt, Abbruch nach Seite ${pages.length}`);
      break;
    }
    if (pages.length >= maxPages) {
      warnings.push(`Limit von ${maxPages} Seiten erreicht, weitere Seiten fehlen`);
      break;
    }
    visited.add(pageKey(next));
    try {
      pages.push(await fetchPage(next));
    } catch (error) {
      warnings.push(`Seite ${pages.length + 1} (${next}) nicht ladbar: ${errorText(error)}`);
      break;
    }
    onProgress?.(pages.length);
  }
  return { pages, warnings };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
