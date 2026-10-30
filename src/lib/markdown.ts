import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

export function htmlToMarkdown(html: string): string {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
  });
  service.use(gfm);
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
