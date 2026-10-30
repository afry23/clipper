import { clipDocument } from '../lib/clip';

declare global {
  interface Window {
    __clipperInstalled?: boolean;
  }
}

// executeScript kann mehrfach injizieren; Listener nur einmal registrieren
if (!window.__clipperInstalled) {
  window.__clipperInstalled = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'do-clip') return;
    try {
      sendResponse({ ok: true, ...clipDocument(document, location.href) });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
}
