const button = document.querySelector<HTMLButtonElement>('#clip')!;
const statusEl = document.querySelector<HTMLDivElement>('#status')!;

function show(text: string, isError = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

button.addEventListener('click', async () => {
  // Muss vor jedem await stehen, sonst läuft die User-Geste ab. Bereits erteilte Rechte lösen keinen Dialog aus.
  const granted = chrome.permissions.request({ origins: ['<all_urls>'] });
  button.disabled = true;
  show('Clippe …');
  try {
    const hasHostAccess = await granted.catch(() => false);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) throw new Error('Kein aktiver Tab');
    const result = await chrome.runtime.sendMessage({ type: 'clip', tabId: tab.id });
    if (result?.ok) {
      const failed = result.imagesFailed ? `, ${result.imagesFailed} nicht ladbar` : '';
      const note = hasHostAccess ? '' : ' (ohne Zugriff auf alle Seiten: Bilder evtl. nur als Remote-Link)';
      show(`Gespeichert: ${result.path}\nBilder: ${result.imagesSaved}${failed}${note}`);
    }
    else show(result?.error ?? 'Unbekannter Fehler', true);
  } catch (error) {
    show(error instanceof Error ? error.message : String(error), true);
  } finally {
    button.disabled = false;
  }
});
export {};
