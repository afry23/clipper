// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clipPages } from '../src/lib/clip';
import {
  collectPages,
  findNextPageUrl,
  findSinglePageUrl,
  sameArticle,
  type PageInput,
} from '../src/lib/pagination';

const BASE = 'https://example.com/story/mein-artikel';

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

const page = (body: string, head = '') => parse(`<html><head>${head}</head><body>${body}</body></html>`);

describe('findNextPageUrl', () => {
  it('nutzt rel=next', () => {
    const doc = page('', '<link rel="next" href="/story/mein-artikel/2">');
    expect(findNextPageUrl(doc, BASE)).toBe('https://example.com/story/mein-artikel/2');
  });

  it('findet "Weiter" im Pager', () => {
    const doc = page('<div class="pagination"><a href="?page=2">Weiter »</a></div>'.replace('Weiter »', 'Weiter'));
    expect(findNextPageUrl(doc, BASE)).toBe(`${BASE}?page=2`);
  });

  it('findet Seitenzahl current+1 im nummerierten Pager', () => {
    const doc = page(`<ul class="pager"><li><a href="${BASE}">1</a></li><li class="active"><span>2</span></li><li><a href="${BASE}-3">3</a></li></ul>`);
    expect(findNextPageUrl(doc, `${BASE}-2`, BASE)).toBe(`${BASE}-3`);
  });

  it('erste Seite: aktuelle Seite ohne Link wird als current erkannt', () => {
    const doc = page(`<div class="pagination"><strong>1</strong> <a href="${BASE}/page/2">2</a> <a href="${BASE}/page/3">3</a></div>`);
    expect(findNextPageUrl(doc, BASE)).toBe(`${BASE}/page/2`);
  });

  it('findet textlosen Pfeil über aria-label', () => {
    const doc = page('<nav aria-label="Seitennavigation"><a href="?page=2" aria-label="Nächste Seite">›</a></nav>');
    expect(findNextPageUrl(doc, BASE)).toBe(`${BASE}?page=2`);
  });

  it('ignoriert "Nächster Artikel" und fremde Artikel', () => {
    const doc = page('<a href="/story/anderer-artikel">Weiter</a><a href="/news/x">Nächster Artikel</a>');
    expect(findNextPageUrl(doc, BASE)).toBeUndefined();
  });

  it('ignoriert andere Origins und javascript:-Links', () => {
    const doc = page('<div class="pagination"><a href="https://evil.example/story/mein-artikel-2">Weiter</a><a href="javascript:void(0)">Next</a></div>');
    expect(findNextPageUrl(doc, BASE)).toBeUndefined();
  });

  it('liefert nichts auf der letzten Seite', () => {
    const doc = page(`<div class="pagination"><a href="${BASE}">Zurück</a><span>3</span></div>`);
    expect(findNextPageUrl(doc, `${BASE}-3`, BASE)).toBeUndefined();
  });
});

describe('sameArticle', () => {
  it('erkennt Seitenvarianten', () => {
    for (const other of [`${BASE}?page=2`, `${BASE}-2`, `${BASE}/2`, `${BASE}/page/2`, `${BASE}_p3`, `${BASE}.html`]) {
      expect(sameArticle(other, BASE), other).toBe(true);
    }
  });
  it('lehnt andere Artikel, Origins und Parameter ab', () => {
    expect(sameArticle('https://example.com/story/anderer', BASE)).toBe(false);
    expect(sameArticle('https://other.example/story/mein-artikel', BASE)).toBe(false);
    expect(sameArticle(`${BASE}?id=7`, `${BASE}?id=8&page=2`)).toBe(false);
  });
});

describe('findSinglePageUrl', () => {
  it('findet Druckansicht', () => {
    const doc = page('<a href="/story/mein-artikel?print=1">Druckansicht</a>');
    expect(findSinglePageUrl(doc, BASE)).toBe(`${BASE}?print=1`);
  });
});

function fakeSite(pagesByUrl: Record<string, Document>) {
  const calls: string[] = [];
  return {
    calls,
    fetchPage: async (url: string): Promise<PageInput> => {
      calls.push(url);
      const doc = pagesByUrl[url];
      if (!doc) throw new Error('HTTP 404');
      return { doc, url };
    },
  };
}

const nextLink = (href: string) => `<link rel="next" href="${href}">`;

describe('collectPages', () => {
  const opts = { maxPages: 50, preferSinglePage: false };

  it('folgt der Kette bis zur letzten Seite', async () => {
    const site = fakeSite({
      [`${BASE}-2`]: page('', nextLink(`${BASE}-3`)),
      [`${BASE}-3`]: page(''),
    });
    const first = { doc: page('', nextLink(`${BASE}-2`)), url: BASE };
    const result = await collectPages(first, { ...opts, fetchPage: site.fetchPage });
    expect(result.pages.map((p) => p.url)).toEqual([BASE, `${BASE}-2`, `${BASE}-3`]);
    expect(result.warnings).toEqual([]);
  });

  it('bricht bei Zyklus ab', async () => {
    const site = fakeSite({ [`${BASE}-2`]: page('', nextLink(BASE)) });
    const first = { doc: page('', nextLink(`${BASE}-2`)), url: BASE };
    const result = await collectPages(first, { ...opts, fetchPage: site.fetchPage });
    expect(result.pages).toHaveLength(2);
    expect(result.warnings[0]).toContain('Seitenschleife');
  });

  it('beachtet das Seitenlimit', async () => {
    const docs: Record<string, Document> = {};
    for (let i = 2; i <= 10; i++) docs[`${BASE}-${i}`] = page('', nextLink(`${BASE}-${i + 1}`));
    const site = fakeSite(docs);
    const first = { doc: page('', nextLink(`${BASE}-2`)), url: BASE };
    const result = await collectPages(first, { ...opts, maxPages: 3, fetchPage: site.fetchPage });
    expect(result.pages).toHaveLength(3);
    expect(result.warnings[0]).toContain('Limit von 3');
    expect(site.calls).toHaveLength(2);
  });

  it('behält bisherige Seiten bei Ladefehler', async () => {
    const site = fakeSite({});
    const first = { doc: page('', nextLink(`${BASE}-2`)), url: BASE };
    const result = await collectPages(first, { ...opts, fetchPage: site.fetchPage });
    expect(result.pages).toHaveLength(1);
    expect(result.warnings[0]).toContain('HTTP 404');
  });

  it('bricht auf Wunsch ab', async () => {
    const site = fakeSite({ [`${BASE}-2`]: page('') });
    const first = { doc: page('', nextLink(`${BASE}-2`)), url: BASE };
    const result = await collectPages(first, { ...opts, fetchPage: site.fetchPage, isCancelled: () => true });
    expect(result.pages).toHaveLength(1);
    expect(result.warnings[0]).toContain('Abgebrochen');
  });

  it('bevorzugt Ein-Seiten-Ansicht bei paginierten Artikeln, fällt bei Fehler zurück', async () => {
    const withPrint = page('<a href="/story/mein-artikel?print=1">Druckansicht</a>', nextLink(`${BASE}-2`));
    const single = page('');
    const site = fakeSite({ [`${BASE}?print=1`]: single });
    const result = await collectPages({ doc: withPrint, url: BASE }, { ...opts, preferSinglePage: true, fetchPage: site.fetchPage });
    expect(result.pages).toEqual([{ doc: single, url: `${BASE}?print=1` }]);

    const broken = fakeSite({ [`${BASE}-2`]: page('') });
    const fallback = await collectPages({ doc: withPrint, url: BASE }, { ...opts, preferSinglePage: true, fetchPage: broken.fetchPage });
    expect(fallback.pages).toHaveLength(2);
    expect(fallback.warnings[0]).toContain('Ein-Seiten-Ansicht');
  });

  it('nutzt Druckansicht nicht bei Artikeln ohne Folgeseite', async () => {
    const doc = page('<a href="/story/mein-artikel?print=1">Druckansicht</a>');
    const site = fakeSite({});
    const result = await collectPages({ doc, url: BASE }, { ...opts, preferSinglePage: true, fetchPage: site.fetchPage });
    expect(result.pages).toHaveLength(1);
    expect(site.calls).toEqual([]);
  });
});

const filler = (word: string) => `${word} `.repeat(120);

describe('clipPages', () => {
  const pager = '<div class="pagination"><a href="?page=2">Weiter</a></div>';
  const article = (n: number, extra = '') => `<html><head><title>Mein Artikel</title></head><body>
    <article><h1>Mein Artikel</h1><p>Seite ${n}</p><p>${filler(`Inhalt${n}`)}</p>${extra}
    <p>Seite ${n} von 2</p>${pager}</article></body></html>`;

  it('verbindet Seiten, entfernt Pager, Seitenzähler und wiederholte Überschrift', () => {
    const p1 = { doc: parse(article(1, '<img src="a.jpg">')), url: BASE };
    const p2 = { doc: parse(article(2, '<img src="a.jpg"><img src="/b.jpg">')), url: `${BASE}-2` };
    const result = clipPages([p1, p2], p1.doc, p1.url, new Date('2026-10-30T12:00:00Z'));

    expect(result.markdown).toContain('pages: 2');
    expect(result.markdown.indexOf('Inhalt1')).toBeLessThan(result.markdown.indexOf('Inhalt2'));
    expect(result.markdown.match(/# Mein Artikel/g)).toHaveLength(1);
    expect(result.markdown).not.toContain('Weiter');
    expect(result.markdown).not.toContain('Seite 1 von 2');
    expect(result.images.map((i) => i.url)).toEqual(['https://example.com/story/a.jpg', 'https://example.com/b.jpg']);
  });

  it('überspringt Seiten ohne Inhalt mit Warnung', () => {
    const p1 = { doc: parse(article(1)), url: BASE };
    const empty = { doc: parse('<html><body></body></html>'), url: `${BASE}-2` };
    const result = clipPages([p1, empty], p1.doc, p1.url);
    expect(result.warnings[0]).toContain('übersprungen');
  });
});
