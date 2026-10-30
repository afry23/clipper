const button = document.querySelector<HTMLButtonElement>('#clip')!;
const cancelButton = document.querySelector<HTMLButtonElement>('#cancel')!;
const statusEl = document.querySelector<HTMLDivElement>('#status')!;

function show(text: string, isError = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

let activeTabId: number | undefined;

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'progress') show(`Clippe … Seite ${message.pages}`);
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
    if (result?.ok) {
      const lines = [`Gespeichert: ${result.path}`];
      if (result.pages > 1) lines.push(`Seiten: ${result.pages}`);
      const failed = result.imagesFailed ? `, ${result.imagesFailed} nicht ladbar` : '';
      const note = hasHostAccess ? '' : ' (ohne Zugriff auf alle Seiten: Bilder evtl. nur als Remote-Link)';
      lines.push(`Bilder: ${result.imagesSaved}${failed}${note}`);
      for (const warning of result.warnings ?? []) lines.push(`⚠ ${warning}`);
      show(lines.join('\n'));
    } else {
      show(result?.error ?? 'Unbekannter Fehler', true);
    }
  } catch (error) {
    show(error instanceof Error ? error.message : String(error), true);
  } finally {
    button.disabled = false;
    cancelButton.hidden = true;
    activeTabId = undefined;
  }
});

export {};
