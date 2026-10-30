import { clipPages } from '../lib/clip';
import { collectPages, type PageInput } from '../lib/pagination';

declare global {
  interface Window {
    __clipperInstalled?: boolean;
  }
}

interface ClipOptions {
  paginate: boolean;
  maxPages: number;
  preferSinglePage: boolean;
}

let cancelled = false;

async function fetchPage(url: string): Promise<PageInput> {
  const response = await fetch(url, { credentials: 'include', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!/html/i.test(response.headers.get('content-type') ?? '')) throw new Error('keine HTML-Seite');
  const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
  return { doc, url: response.url || url };
}

async function clip(options: ClipOptions) {
  cancelled = false;
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
  const result = clipPages(collected.pages, document, location.href);
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
