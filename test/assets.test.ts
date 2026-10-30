// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { downloadImages, extensionFor, rewriteMarkdown } from '../src/lib/assets';

const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

function fakeFetch(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    const route = routes[url];
    if (!route) return new Response('nope', { status: 404 });
    return route();
  };
  return { fn, calls };
}

const image = () => new Response(png, { headers: { 'content-type': 'image/png' } });

describe('downloadImages', () => {
  it('speichert Bilder unter Hash-Namen und dedupliziert gleiche Inhalte', async () => {
    const { fn } = fakeFetch({ 'https://x/a': image, 'https://x/b': image });
    const outcome = await downloadImages(
      [
        { token: 'clipper-img:0', url: 'https://x/a' },
        { token: 'clipper-img:1', url: 'https://x/b' },
      ],
      { fetchFn: fn },
    );
    const names = new Set([...outcome.saved.values()].map((f) => f.name));
    expect(outcome.saved.size).toBe(2);
    expect(names.size).toBe(1);
    expect([...names][0]).toMatch(/^[0-9a-f]{12}\.png$/);
  });

  it('meldet Fehler, bricht aber nicht ab, und wiederholt einmal', async () => {
    const { fn, calls } = fakeFetch({ 'https://x/ok': image });
    const outcome = await downloadImages(
      [
        { token: 'clipper-img:0', url: 'https://x/missing' },
        { token: 'clipper-img:1', url: 'https://x/ok' },
      ],
      { fetchFn: fn },
    );
    expect(outcome.saved.size).toBe(1);
    expect(outcome.failed).toEqual([{ url: 'https://x/missing', reason: 'HTTP 404' }]);
    expect(calls.filter((u) => u === 'https://x/missing')).toHaveLength(2);
  });

  it('lehnt Nicht-Bilder ab', async () => {
    const { fn } = fakeFetch({ 'https://x/page': () => new Response('<html>', { headers: { 'content-type': 'text/html' } }) });
    const outcome = await downloadImages([{ token: 'clipper-img:0', url: 'https://x/page' }], { fetchFn: fn });
    expect(outcome.failed[0].reason).toContain('kein Bild');
  });
});

describe('rewriteMarkdown', () => {
  it('ersetzt Tokens durch assets/-Pfade, Fehlschläge durch Original-URL, ohne Token-Präfix-Kollision', async () => {
    const images = Array.from({ length: 12 }, (_, i) => ({ token: `clipper-img:${i}`, url: `https://x/${i}` }));
    const { fn } = fakeFetch({ 'https://x/1': image });
    const outcome = await downloadImages(images, { fetchFn: fn });
    const md = '![a](clipper-img:1) ![b](clipper-img:10) ![c](clipper-img:11)';
    const out = rewriteMarkdown(md, images, outcome);
    expect(out).toMatch(/^!\[a\]\(assets\/[0-9a-f]{12}\.png\) !\[b\]\(https:\/\/x\/10\) !\[c\]\(https:\/\/x\/11\)$/);
  });
});

describe('extensionFor', () => {
  it('nutzt MIME, dann URL-Endung', () => {
    expect(extensionFor('image/jpeg; charset=x', 'https://x/a')).toBe('jpg');
    expect(extensionFor('', 'https://x/a/photo.WEBP')).toBe('webp');
    expect(extensionFor('', 'https://x/a')).toBe('img');
  });
});
