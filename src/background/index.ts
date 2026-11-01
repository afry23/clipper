import { downloadImages, rewriteMarkdown, type ImageOutcome } from '../lib/assets';
import type { ClipResult } from '../lib/clip';
import { applyEdits, type Edits } from '../lib/edits';
import { toDownloadUrl } from '../lib/files';
import { folderName } from '../lib/naming';
import { loadSettings, type Settings } from '../lib/settings';
import { buildZip } from '../lib/zip';

type Mode = 'auto' | 'page' | 'selection';
type Payload = ClipResult & { ok: true; pages: number };
type Failure = { ok: false; error: string };

export interface ClipSummary {
  ok: true;
  path: string;
  imagesSaved: number;
  imagesFailed: number;
  pages: number;
  warnings: string[];
  selection: boolean;
}

export type { Edits };

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function save(path: string, content: string | Uint8Array, mime: string): Promise<void> {
  const url = toDownloadUrl(content, mime);
  try {
    // overwrite: erneutes Clippen am selben Tag ersetzt die Dateien, statt "(1)"-Kopien mit kaputten Bildpfaden zu erzeugen
    await chrome.downloads.download({ url, filename: path, conflictAction: 'overwrite', saveAs: false });
  } finally {
    if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

async function extract(tabId: number, mode: Mode, settings: Settings): Promise<Payload | Failure> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  return chrome.tabs.sendMessage(tabId, {
    type: 'do-clip',
    options: {
      mode,
      paginate: settings.paginate,
      maxPages: settings.maxPages,
      preferSinglePage: settings.preferSinglePage,
    },
  });
}

async function store(payload: Payload, settings: Settings): Promise<ClipSummary> {
  const date = payload.meta.clipped.slice(0, 10);
  const folder = folderName(settings.folderTemplate, { title: payload.title, date, site: payload.meta.site });

  let outcome: ImageOutcome | undefined;
  if (settings.downloadImages && payload.images.length > 0) outcome = await downloadImages(payload.images);
  const markdown = rewriteMarkdown(payload.markdown, payload.images, outcome);

  const files = new Map<string, { path: string; data: Uint8Array; mime: string }>();
  files.set('index.md', { path: 'index.md', data: new TextEncoder().encode(markdown), mime: 'text/markdown;charset=utf-8' });
  for (const file of outcome?.saved.values() ?? []) {
    const path = `assets/${file.name}`;
    files.set(path, { path, data: file.bytes, mime: file.mime || 'application/octet-stream' });
  }

  let resultPath: string;
  if (settings.format === 'zip') {
    resultPath = `${settings.subfolder}/${folder}.zip`;
    const zip = buildZip([...files.values()].map((f) => ({ path: `${folder}/${f.path}`, data: f.data })));
    await save(resultPath, zip, 'application/zip');
  } else {
    const root = `${settings.subfolder}/${folder}`;
    for (const file of files.values()) await save(`${root}/${file.path}`, file.data, file.mime);
    resultPath = `${root}/index.md`;
  }

  const savedImages = outcome?.saved.size ?? 0;
  return {
    ok: true,
    path: resultPath,
    imagesSaved: savedImages,
    imagesFailed: settings.downloadImages ? payload.images.length - savedImages : 0,
    pages: payload.pages,
    warnings: payload.warnings,
    selection: !!payload.selection,
  };
}

async function clipTab(tabId: number, mode: Mode, allowPreview: boolean) {
  const settings = await loadSettings();
  const payload = await extract(tabId, mode, settings);
  if (!payload.ok) return payload;
  if (allowPreview && settings.preview) {
    // Popups schließen sich bei Fokusverlust: Entwurf in einem eigenen Tab bearbeiten
    const draft = crypto.randomUUID();
    await chrome.storage.session.set({ [draftKey(draft)]: payload });
    await chrome.tabs.create({ url: chrome.runtime.getURL(`editor.html?draft=${draft}`) });
    return { ok: true as const, editor: true as const };
  }
  return store(payload, settings);
}

const draftKey = (draft: string) => `draft:${draft}`;

async function savePreview(payload: Payload, edits: Edits) {
  return store(applyEdits(payload, edits), await loadSettings());
}

// Entwürfe verfallen, wenn der Editor-Tab geschlossen wird; Aufräumen übernimmt der Editor selbst,
// hier nur das Sicherheitsnetz für Entwürfe verwaister Tabs.
chrome.tabs.onRemoved.addListener(async () => {
  const urls = new Set((await chrome.tabs.query({})).map((tab) => tab.url ?? ''));
  const stored = await chrome.storage.session.get(null);
  const stale = Object.keys(stored).filter(
    (key) => key.startsWith('draft:') && ![...urls].some((url) => url.includes(`draft=${key.slice(6)}`)),
  );
  if (stale.length > 0) await chrome.storage.session.remove(stale);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  let work: Promise<unknown> | undefined;
  switch (message?.type) {
    case 'cancel':
      void chrome.tabs.sendMessage(message.tabId, { type: 'cancel' }).catch(() => {});
      return;
    case 'clip':
      work = clipTab(message.tabId, 'auto', true);
      break;
    case 'save':
      work = savePreview(message.payload, message.edits ?? {});
      break;
    default:
      return;
  }
  work.then(sendResponse, (error) => sendResponse({ ok: false, error: errorMessage(error) }));
  return true; // asynchrone Antwort
});

// Kontextmenü: Seite oder Auswahl; Rückmeldung über das Badge, da kein Popup offen ist
const MENU_PAGE = 'clip-page';
const MENU_SELECTION = 'clip-selection';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENU_PAGE, title: 'Seite clippen', contexts: ['page'] });
  chrome.contextMenus.create({ id: MENU_SELECTION, title: 'Auswahl clippen', contexts: ['selection'] });
});

function flashBadge(text: string, color: string): void {
  void chrome.action.setBadgeBackgroundColor({ color });
  void chrome.action.setBadgeText({ text });
  setTimeout(() => void chrome.action.setBadgeText({ text: '' }), 4000);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (tab?.id === undefined) return;
  try {
    const result = await clipTab(tab.id, info.menuItemId === MENU_SELECTION ? 'selection' : 'page', false);
    if ('ok' in result && result.ok) flashBadge('✓', '#2e7d32');
    else flashBadge('!', '#b00020');
  } catch {
    flashBadge('!', '#b00020');
  }
});
