import type { ClipSummary } from '../background';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const button = $<HTMLButtonElement>('#clip');
const cancelButton = $<HTMLButtonElement>('#cancel');
const statusEl = $<HTMLDivElement>('#status');

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
    if (result?.editor) {
      show('Editor geöffnet');
      window.close();
    }
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
