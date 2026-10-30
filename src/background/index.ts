import { downloadImages, rewriteMarkdown, type ImageOutcome } from '../lib/assets';
import { toDownloadUrl } from '../lib/files';
import type { ClipResult } from '../lib/clip';

const DEFAULT_SUBFOLDER = 'Clips';

type ClipResponse = ({ ok: true; pages: number } & ClipResult) | { ok: false; error: string };

export interface ClipSummary {
  ok: true;
  path: string;
  imagesSaved: number;
  imagesFailed: number;
  pages: number;
  warnings: string[];
}

async function save(path: string, content: string | Uint8Array, mime: string): Promise<void> {
  const url = toDownloadUrl(content, mime);
  try {
    // overwrite: erneutes Clippen am selben Tag ersetzt die Dateien, statt "(1)"-Kopien mit kaputten Bildpfaden zu erzeugen
    await chrome.downloads.download({ url, filename: path, conflictAction: 'overwrite', saveAs: false });
  } finally {
    if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

async function clipTab(tabId: number): Promise<ClipSummary | { ok: false; error: string }> {
  const {
    subfolder = DEFAULT_SUBFOLDER,
    downloadImages: withImages = true,
    paginate = true,
    maxPages = 50,
    preferSinglePage = true,
  } = await chrome.storage.sync.get(['subfolder', 'downloadImages', 'paginate', 'maxPages', 'preferSinglePage']);

  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  const result: ClipResponse = await chrome.tabs.sendMessage(tabId, {
    type: 'do-clip',
    options: { paginate, maxPages, preferSinglePage },
  });
  if (!result.ok) return result;

  const root = `${subfolder}/${result.folder}`;

  let outcome: ImageOutcome | undefined;
  if (withImages && result.images.length > 0) outcome = await downloadImages(result.images);

  const written = new Set<string>();
  for (const file of outcome?.saved.values() ?? []) {
    if (written.has(file.name)) continue;
    written.add(file.name);
    await save(`${root}/assets/${file.name}`, file.bytes, file.mime || 'application/octet-stream');
  }

  const markdown = rewriteMarkdown(result.markdown, result.images, outcome);
  await save(`${root}/index.md`, markdown, 'text/markdown;charset=utf-8');

  return {
    ok: true,
    path: `${root}/index.md`,
    imagesSaved: outcome?.saved.size ?? 0,
    imagesFailed: withImages ? result.images.length - (outcome?.saved.size ?? 0) : 0,
    pages: result.pages,
    warnings: result.warnings,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'cancel') {
    void chrome.tabs.sendMessage(message.tabId, { type: 'cancel' }).catch(() => {});
    return;
  }
  if (message?.type !== 'clip') return;
  clipTab(message.tabId).then(sendResponse, (error) =>
    sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
  );
  return true; // asynchrone Antwort
});
