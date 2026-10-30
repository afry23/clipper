export interface ImageRef {
  token: string;
  url: string;
}

const LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-srcset', 'data-lazy-srcset'];

/** Wählt aus einem srcset-Wert die Variante mit dem größten w- bzw. x-Deskriptor (URLs dürfen Kommas enthalten). */
export function pickFromSrcset(srcset: string): string | undefined {
  let best: { url: string; weight: number } | undefined;
  const tokens = srcset.trim().split(/\s+/);
  let url: string | undefined;
  const consider = (candidate: string, weight: number) => {
    if (!best || weight > best.weight) best = { url: candidate, weight };
  };
  for (const token of tokens) {
    if (url === undefined) {
      if (token.endsWith(',')) consider(token.replace(/,+$/, ''), 1); // URL ohne Deskriptor
      else url = token;
      continue;
    }
    const match = /^([\d.]+)[wx],?$/.exec(token);
    consider(url, match ? parseFloat(match[1]) : 1);
    url = undefined;
    if (!match && !token.endsWith(',')) url = token; // Token war bereits die nächste URL
  }
  if (url !== undefined) consider(url, 1);
  return best?.url;
}

function isPlaceholder(src: string): boolean {
  return src.startsWith('data:') && src.length < 300;
}

/** Bestmögliche Bildquelle (picture/srcset/lazy-Attribute), absolut aufgelöst. */
export function bestImageSource(img: Element, base: string): string | undefined {
  const raw: (string | null | undefined)[] = [];
  const picture = img.closest('picture');
  if (picture) {
    for (const source of picture.querySelectorAll('source')) {
      const srcset = source.getAttribute('srcset');
      if (srcset) raw.push(pickFromSrcset(srcset));
    }
  }
  const srcset = img.getAttribute('srcset');
  if (srcset) raw.push(pickFromSrcset(srcset));
  for (const attr of LAZY_ATTRS) {
    const value = img.getAttribute(attr);
    if (value) raw.push(attr.endsWith('srcset') ? pickFromSrcset(value) : value);
  }
  raw.push(img.getAttribute('src'));

  for (const candidate of raw) {
    if (!candidate || isPlaceholder(candidate)) continue;
    try {
      return new URL(candidate, base).href;
    } catch {
      /* nächsten Kandidaten versuchen */
    }
  }
  return undefined;
}

/** Setzt vor der Extraktion für jedes Bild die beste absolute Quelle als `src`. */
export function resolveImages(doc: Document, base: string): void {
  for (const img of doc.querySelectorAll('img')) {
    const src = bestImageSource(img, base);
    if (!src) continue;
    img.setAttribute('src', src);
    img.removeAttribute('srcset');
  }
}

/**
 * Ersetzt jedes `src` im Container durch einen Token (`clipper-img:N`) und liefert die Zuordnung.
 * Gleiche URLs teilen sich einen Token. Bilder ohne Quelle werden entfernt.
 */
export function tokenizeImages(container: Element): ImageRef[] {
  const byUrl = new Map<string, ImageRef>();
  for (const img of container.querySelectorAll('img')) {
    const src = img.getAttribute('src');
    if (!src || isPlaceholder(src)) {
      img.remove();
      continue;
    }
    let ref = byUrl.get(src);
    if (!ref) {
      ref = { token: `clipper-img:${byUrl.size}`, url: src };
      byUrl.set(src, ref);
    }
    img.setAttribute('src', ref.token);
  }
  return [...byUrl.values()];
}
