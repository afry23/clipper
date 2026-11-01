import { clipPages, clipSelection, type ClipResult } from '../lib/clip';
import { collectPages, type PageInput } from '../lib/pagination';

declare global {
  interface Window {
    __clipperInstalled?: boolean;
  }
}

interface ClipOptions {
  /** auto: Auswahl, falls vorhanden, sonst ganze Seite */
  mode: 'auto' | 'page' | 'selection';
  paginate: boolean;
  maxPages: number;
  preferSinglePage: boolean;
  leadImage: boolean;
}

let cancelled = false;

async function fetchPage(url: string): Promise<PageInput> {
  const response = await fetch(url, { credentials: 'include', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!/html/i.test(response.headers.get('content-type') ?? '')) throw new Error('keine HTML-Seite');
  const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
  return { doc, url: response.url || url };
}

function selectionHtml(): string | undefined {
  const selection = getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return undefined;
  const wrapper = document.createElement('div');
  for (let i = 0; i < selection.rangeCount; i++) wrapper.append(selection.getRangeAt(i).cloneContents());
  return wrapper.innerHTML;
}

async function clip(options: ClipOptions): Promise<ClipResult & { pages: number }> {
  cancelled = false;
  if (options.mode !== 'page') {
    const html = selectionHtml();
    if (html) return { ...clipSelection(html, document, location.href), pages: 1 };
    if (options.mode === 'selection') throw new Error('Keine Auswahl');
  }
  const first: PageInput = { doc: document, url: location.href };
  const collected = options.paginate
    ? await collectPages(first, {
        maxPages: options.maxPages,
        preferSinglePage: options.preferSinglePage,
        fetchPage,
        isCancelled: () => cancelled,
        onProgress: (pages) => void chrome.runtime.sendMessage({ type: 'progress', pages }).catch(() => {}),
      })
    : { pages: [first], warnings: [] };
  const result = clipPages(collected.pages, document, location.href, new Date(), { leadImage: options.leadImage });
  return { ...result, warnings: [...collected.warnings, ...result.warnings], pages: collected.pages.length };
}

// executeScript kann mehrfach injizieren; Listener nur einmal registrieren
if (!window.__clipperInstalled) {
  window.__clipperInstalled = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'cancel') {
      cancelled = true;
      return;
    }
    if (message?.type !== 'do-clip') return;
    clip(message.options).then(
      (result) => sendResponse({ ok: true, ...result }),
      (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
    );
    return true; // asynchrone Antwort
  });
}
