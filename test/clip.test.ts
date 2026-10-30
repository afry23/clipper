// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clipDocument } from '../src/lib/clip';
import { extractMeta, normalizeDate } from '../src/lib/meta';
import { slugify } from '../src/lib/slug';

const URL_ = 'https://example.com/blog/artikel?utm=x';

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

const fixture = `<!doctype html><html><head>
<title>Mein Artikel | Example</title>
<link rel="canonical" href="/blog/artikel">
<meta property="og:site_name" content="Example">
<script type="application/ld+json">{"@type":"NewsArticle","author":{"@type":"Person","name":"Erika Mustermann"},"datePublished":"2026-10-12T08:00:00+02:00"}</script>
</head><body>
<nav>Menü Menü Menü</nav>
<article><h1>Mein Artikel</h1>
<p>${'Das ist ein längerer Absatz mit Inhalt. '.repeat(20)}</p>
<p>Siehe <a href="/andere-seite">andere Seite</a> und <a href="https://other.example/x">extern</a>.</p>
<p>${'Noch mehr Text für die Erkennung. '.repeat(20)}</p>
</article></body></html>`;

describe('extractMeta', () => {
  it('liest Autor und Datum aus JSON-LD, canonical als source', () => {
    const meta = extractMeta(parse(fixture), URL_);
    expect(meta.author).toBe('Erika Mustermann');
    expect(meta.published).toBe('2026-10-12T06:00:00.000Z');
    expect(meta.source).toBe('https://example.com/blog/artikel');
    expect(meta.site).toBe('Example');
  });

  it('lässt fehlende Felder weg', () => {
    const meta = extractMeta(parse('<html><head></head><body></body></html>'), URL_);
    expect(meta.author).toBeUndefined();
    expect(meta.published).toBeUndefined();
    expect(meta.source).toBe(URL_);
  });

  it('normalisiert Datum', () => {
    expect(normalizeDate('2026-10-12')).toBe('2026-10-12');
    expect(normalizeDate('kein datum')).toBeUndefined();
  });
});

describe('clipDocument', () => {
  const result = clipDocument(parse(fixture), URL_, new Date('2026-10-30T12:00:00Z'));

  it('erzeugt Frontmatter mit Metadaten', () => {
    expect(result.markdown).toMatch(/^---\ntitle: "[^"]+"\nsource: "https:\/\/example.com\/blog\/artikel"\nauthor: "Erika Mustermann"\npublished: /);
    expect(result.markdown).toContain('clipped: 2026-10-30T12:00:00.000Z');
  });

  it('entfernt Navigation und behält Links', () => {
    expect(result.markdown).not.toContain('Menü');
    expect(result.markdown).toContain('[andere Seite](https://example.com/andere-seite)');
    expect(result.markdown).toContain('[extern](https://other.example/x)');
  });

  it('bildet Ordnernamen', () => {
    expect(result.folder).toBe('2026-10-30-mein-artikel');
  });

  it('wirft bei Seite ohne Inhalt', () => {
    expect(() => clipDocument(parse('<html><body></body></html>'), URL_)).toThrow();
  });
});

describe('slugify', () => {
  it('entfernt Umlaute und Sonderzeichen', () => {
    expect(slugify('Über Äpfel & Birnen!')).toBe('uber-apfel-birnen');
    expect(slugify('???')).toBe('artikel');
  });
});
