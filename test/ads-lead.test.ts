// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clipDocument, clipPages } from '../src/lib/clip';

const LONG = 'Dies ist ein ausreichend langer Absatz mit viel Text, damit Readability ihn sicher als Artikel erkennt. '.repeat(6);

function page(body: string, head = ''): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><head><title>Test | Site</title>${head}</head><body>${body}</body></html>`,
    'text/html',
  );
}

describe('Werbung und Titelbild', () => {
  const ad = `<div class="ad ad--inread"><p class="ad--inread-header__text">Videos by heise</p>
    <figure class="video"><a-video entry-id="1"></a-video></figure><p>00:00 / 17:18</p></div>`;
  const article = `<article><h1>Titel</h1><p>${LONG}</p><p>${LONG}</p>${ad}<p>${LONG} Ende.</p></article>`;

  it('entfernt Werbeblöcke samt Video-Player', () => {
    const { body } = clipDocument(page(article), 'https://example.com/a');
    expect(body).not.toContain('Videos by heise');
    expect(body).not.toContain('17:18');
    expect(body).toContain('Ende.');
  });

  it('ergänzt og:image als Titelbild vor dem ersten Absatz', () => {
    const head = '<meta property="og:image" content="/img/lead.jpg">';
    const result = clipDocument(page(article, head), 'https://example.com/a');
    expect(result.body.startsWith('![](clipper-img:0)')).toBe(true);
    expect(result.images[0].url).toBe('https://example.com/img/lead.jpg');
  });

  it('doppelt kein Bild, wenn der Artikel schon eins vor dem ersten Absatz hat', () => {
    const withImg = `<article><h1>Titel</h1><img src="https://example.com/own.jpg"><p>${LONG}</p><p>${LONG}</p></article>`;
    const head = '<meta property="og:image" content="https://example.com/lead.jpg">';
    const result = clipDocument(page(withImg, head), 'https://example.com/a');
    expect(result.images.map((i) => i.url)).toEqual(['https://example.com/own.jpg']);
  });

  it('entfernt keinen Container, der den Artikel enthält', () => {
    const wrapped = `<div class="ad-wrapper ad--layout"><article><h1>Titel</h1><p>${LONG}</p><p>${LONG}</p></article></div>`;
    expect(clipDocument(page(wrapped), 'https://example.com/a').body).toContain('ausreichend langer Absatz');
  });

  it('lässt das Titelbild weg, wenn die Option aus ist', () => {
    const head = '<meta property="og:image" content="/img/lead.jpg">';
    const doc = page(article, head);
    const result = clipPages([{ doc, url: 'https://example.com/a' }], doc, 'https://example.com/a', new Date(), { leadImage: false });
    expect(result.images).toEqual([]);
  });
});
