import type { ClipSummary } from '../background';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const button = $<HTMLButtonElement>('#clip');
const cancelButton = $<HTMLButtonElement>('#cancel');
const statusEl = $<HTMLDivElement>('#status');
const mainEl = $<HTMLDivElement>('#main');
const previewForm = $<HTMLFormElement>('#preview');

function show(text: string, isError = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

function summaryText(result: ClipSummary, hasHostAccess: boolean): string {
  const lines = [result.selection ? `Auswahl gespeichert: ${result.path}` : `Gespeichert: ${result.path}`];
  if (result.pages > 1) lines.push(`Seiten: ${result.pages}`);
  const failed = result.imagesFailed ? `, ${result.imagesFailed} nicht ladbar` : '';
  const note = hasHostAccess ? '' : ' (ohne Zugriff auf alle Seiten: Bilder evtl. nur als Remote-Link)';
  lines.push(`Bilder: ${result.imagesSaved}${failed}${note}`);
  for (const warning of result.warnings) lines.push(`⚠ ${warning}`);
  return lines.join('\n');
}

let activeTabId: number | undefined;

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'progress') show(`Clippe … Seite ${message.pages}`);
});

$('#settings').addEventListener('click', (event) => {
  event.preventDefault();
  void chrome.runtime.openOptionsPage();
});

cancelButton.addEventListener('click', () => {
  if (activeTabId !== undefined) void chrome.runtime.sendMessage({ type: 'cancel', tabId: activeTabId });
  cancelButton.disabled = true;
});

function showPreview(payload: any, hasHostAccess: boolean): Promise<void> {
  document.body.classList.add('wide');
  mainEl.hidden = true;
  previewForm.hidden = false;
  $<HTMLInputElement>('#p-title').value = payload.meta.title ?? '';
  $<HTMLInputElement>('#p-author').value = payload.meta.author ?? '';
  $<HTMLInputElement>('#p-published').value = payload.meta.published ?? '';
  const parts = [`${payload.pages} Seite(n)`, `${payload.images.length} Bild(er)`];
  if (payload.selection) parts.unshift('Auswahl');
  $('#info').textContent = parts.join(' · ');
  $('#excerpt').textContent = payload.body.slice(0, 1500);
  show(payload.warnings.map((w: string) => `⚠ ${w}`).join('\n'));

  return new Promise<void>((resolve) => {
    $('#discard').onclick = () => {
      show('Verworfen');
      resolve();
    };
    previewForm.onsubmit = async (event) => {
      event.preventDefault();
      $<HTMLButtonElement>('#save').disabled = true;
      show('Speichere …');
      const edits = {
        title: $<HTMLInputElement>('#p-title').value,
        author: $<HTMLInputElement>('#p-author').value,
        published: $<HTMLInputElement>('#p-published').value,
      };
      const result = await chrome.runtime.sendMessage({ type: 'save', payload, edits });
      show(result?.ok ? summaryText(result, hasHostAccess) : (result?.error ?? 'Unbekannter Fehler'), !result?.ok);
      resolve();
    };
  }).finally(() => {
    previewForm.hidden = true;
    mainEl.hidden = false;
    document.body.classList.remove('wide');
  });
}

button.addEventListener('click', async () => {
  // Muss vor jedem await stehen, sonst läuft die User-Geste ab. Bereits erteilte Rechte lösen keinen Dialog aus.
  const granted = chrome.permissions.request({ origins: ['<all_urls>'] });
  button.disabled = true;
  cancelButton.hidden = false;
  cancelButton.disabled = false;
  show('Clippe …');
  try {
    const hasHostAccess = await granted.catch(() => false);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) throw new Error('Kein aktiver Tab');
    activeTabId = tab.id;
    const result = await chrome.runtime.sendMessage({ type: 'clip', tabId: tab.id });
    cancelButton.hidden = true;
    if (result?.preview) await showPreview(result.payload, hasHostAccess);
    else if (result?.ok) show(summaryText(result, hasHostAccess));
    else show(result?.error ?? 'Unbekannter Fehler', true);
  } catch (error) {
    show(error instanceof Error ? error.message : String(error), true);
  } finally {
    button.disabled = false;
    cancelButton.hidden = true;
    activeTabId = undefined;
  }
});
