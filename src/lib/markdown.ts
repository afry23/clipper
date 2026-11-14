import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const IMAGE_URL = /\.(?:png|jpe?g|gif|webp|avif|svg|bmp)$/i;

/** Verweist die URL auf eine Bilddatei (Endung im Pfad, Query und Anker ignoriert)? */
export function isImageUrl(href: string): boolean {
  let path = href.split(/[?#]/)[0];
  try {
    path = decodeURIComponent(href.replace(/[?#].*$/, ''));
  } catch {
    /* undecodierbar: Rohpfad verwenden */
  }
  // Bild-CDNs (z. B. Substack) kodieren die Original-URL samt Endung in den Pfad
  return IMAGE_URL.test(path);
}

export function htmlToMarkdown(html: string): string {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
  });
  service.use(gfm);
  // Bild, das nur auf sich selbst (die Großansicht) verlinkt: Link weglassen, nur das Bild behalten
  service.addRule('image-link', {
    filter: (node) => {
      if (node.nodeName !== 'A') return false;
      const href = node.getAttribute('href');
      return !!href && isImageUrl(href) && !!node.querySelector('img') && !(node.textContent ?? '').trim();
    },
    replacement: (content) => content.trim(),
  });
  // iframes/Videos: nur Link zur Quelle (F14)
  service.addRule('embed', {
    filter: ['iframe', 'video'],
    replacement: (_content, node) => {
      const src = (node as Element).getAttribute('src');
      return src ? `\n\n[Eingebetteter Inhalt](${src})\n\n` : '';
    },
  });
  return service.turndown(html).trim() + '\n';
}
