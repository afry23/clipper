// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ClipResult } from '../src/lib/clip';
import { applyEdits } from '../src/lib/edits';
import { pruneImages } from '../src/lib/images';

const images = [
  { token: 'clipper-img:1', url: 'https://x/1' },
  { token: 'clipper-img:10', url: 'https://x/10' },
];

describe('pruneImages', () => {
  it('unterscheidet clipper-img:1 von clipper-img:10', () => {
    expect(pruneImages('![](clipper-img:10)', images).map((i) => i.token)).toEqual(['clipper-img:10']);
    expect(pruneImages('![](clipper-img:1)', images).map((i) => i.token)).toEqual(['clipper-img:1']);
  });

  it('entfernt Bilder, die nicht mehr im Text stehen', () => {
    expect(pruneImages('nur Text', images)).toEqual([]);
  });
});

function payload(): ClipResult {
  const meta = { title: 'Alt', source: 'https://x/', clipped: '2026-11-01T00:00:00.000Z', pages: 1 } as ClipResult['meta'];
  return {
    meta,
    body: 'Text ![](clipper-img:1) ![](clipper-img:10)',
    markdown: '',
    title: 'Alt',
    images,
    warnings: [],
  };
}

describe('applyEdits', () => {
  it('übernimmt Body und Titel, Frontmatter bleibt', () => {
    const result = applyEdits(payload(), { title: 'Neu', body: 'Neuer Text' });
    expect(result.body).toBe('Neuer Text');
    expect(result.markdown).toContain('title');
    expect(result.markdown).toContain('# Neu\n\nNeuer Text');
  });

  it('filtert gelöschte Bilder, ohne body-Edit bleiben alle', () => {
    expect(applyEdits(payload(), { body: '![](clipper-img:10)' }).images.map((i) => i.token)).toEqual(['clipper-img:10']);
    expect(applyEdits(payload(), { title: 'X' }).images).toHaveLength(2);
  });

  it('leeres Feld entfernt den Eintrag', () => {
    const result = applyEdits({ ...payload(), meta: { ...payload().meta, author: 'A' } }, { author: ' ' });
    expect(result.meta.author).toBeUndefined();
  });
});
