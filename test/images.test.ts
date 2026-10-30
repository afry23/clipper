// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clipDocument } from '../src/lib/clip';
import { bestImageSource, pickFromSrcset, tokenizeImages } from '../src/lib/images';

const BASE = 'https://example.com/blog/post';

function el(html: string): Element {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return doc.body.firstElementChild!;
}

describe('pickFromSrcset', () => {
  it('wählt größten w-Wert', () => {
    expect(pickFromSrcset('a.jpg 480w, b.jpg 1200w, c.jpg 800w')).toBe('b.jpg');
  });
  it('wählt größten x-Wert und behandelt URLs mit Kommas', () => {
    expect(pickFromSrcset('a.jpg 1x, b.jpg 2x')).toBe('b.jpg');
    expect(pickFromSrcset('https://cdn/x/w_100,h_100/a.jpg 100w, https://cdn/x/w_900,h_900/a.jpg 900w')).toBe(
      'https://cdn/x/w_900,h_900/a.jpg',
    );
  });
});

describe('bestImageSource', () => {
  it('bevorzugt srcset vor src und löst relativ auf', () => {
    const img = el('<img src="small.jpg" srcset="small.jpg 1x, /big.jpg 2x">');
    expect(bestImageSource(img, BASE)).toBe('https://example.com/big.jpg');
  });
  it('nutzt data-src bei Platzhalter-src', () => {
    const img = el('<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="real.png">');
    expect(bestImageSource(img, BASE)).toBe('https://example.com/blog/real.png');
  });
  it('nutzt picture/source', () => {
    const picture = el('<picture><source srcset="a.webp 400w, b.webp 900w"><img src="fallback.jpg"></picture>');
    expect(bestImageSource(picture.querySelector('img')!, BASE)).toBe('https://example.com/blog/b.webp');
  });
});

describe('tokenizeImages', () => {
  it('vergibt pro URL einen Token und entfernt Bilder ohne Quelle', () => {
    const div = el('<div><img src="https://x/a.jpg"><img src="https://x/a.jpg"><img src="https://x/b.jpg"><img></div>');
    const refs = tokenizeImages(div);
    expect(refs).toEqual([
      { token: 'clipper-img:0', url: 'https://x/a.jpg' },
      { token: 'clipper-img:1', url: 'https://x/b.jpg' },
    ]);
    expect(div.querySelectorAll('img')).toHaveLength(3);
  });
});

describe('clipDocument mit Bildern', () => {
  it('liefert Tokens im Markdown und Bildliste', () => {
    const text = 'Absatz mit genug Text für die Erkennung. '.repeat(20);
    const html = `<html><head><title>T</title></head><body><article><h1>T</h1><p>${text}</p>
      <img src="a.jpg" alt="Alt"><p>${text}</p><img data-src="/b.png" src="data:image/gif;base64,AAAA" alt="B"></article></body></html>`;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const result = clipDocument(doc, BASE);
    expect(result.images.map((i) => i.url)).toEqual(['https://example.com/blog/a.jpg', 'https://example.com/b.png']);
    expect(result.markdown).toContain('![Alt](clipper-img:0)');
    expect(result.markdown).toContain('![B](clipper-img:1)');
  });
});
