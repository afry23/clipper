import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import type { ClipSummary } from '../background';
import type { ClipResult } from '../lib/clip';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const form = $<HTMLFormElement>('#form');
const statusEl = $<HTMLDivElement>('#status');

function show(text: string, isError = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

function summaryText(result: ClipSummary): string {
  const lines = [`Gespeichert: ${result.path}`, `Bilder: ${result.imagesSaved}`];
  if (result.imagesFailed) lines[1] += `, ${result.imagesFailed} nicht ladbar`;
  for (const warning of result.warnings) lines.push(`⚠ ${warning}`);
  return lines.join('\n');
}

const draft = new URLSearchParams(location.search).get('draft');
const key = `draft:${draft}`;

let originTabId: number | undefined;

/** Bringt den geclippten Artikel-Tab (und sein Fenster) wieder nach vorn. */
async function focusOrigin(): Promise<void> {
  if (originTabId === undefined) return;
  try {
    const tab = await chrome.tabs.get(originTabId);
    await chrome.tabs.update(originTabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch {
    /* Tab wurde inzwischen geschlossen */
  }
}

async function finish(): Promise<void> {
  await chrome.storage.session.remove(key);
  await focusOrigin();
  window.close();
}

async function main(): Promise<void> {
  const stored = (draft ? (await chrome.storage.session.get(key))[key] : undefined) as
    | { payload: ClipResult & { pages: number }; originTabId?: number }
    | undefined;
  const payload = stored?.payload;
  originTabId = stored?.originTabId;
  if (!payload) {
    $('#missing').hidden = false;
    return;
  }
  form.hidden = false;
  $<HTMLInputElement>('#e-title').value = payload.meta.title ?? '';
  $<HTMLInputElement>('#e-author').value = payload.meta.author ?? '';
  $<HTMLInputElement>('#e-published').value = payload.meta.published ?? '';
  const parts = [`${payload.pages} Seite(n)`, `${payload.images.length} Bild(er)`, 'Bild-Tokens (clipper-img:N) nicht ändern'];
  if (payload.selection) parts.unshift('Auswahl');
  $('#info').textContent = parts.join(' · ');
  show(payload.warnings.map((w: string) => `⚠ ${w}`).join('\n'));

  const view = new EditorView({
    parent: $('#editor'),
    state: EditorState.create({
      doc: payload.body,
      extensions: [lineNumbers(), history(), keymap.of([...defaultKeymap, ...historyKeymap]), markdown(), EditorView.lineWrapping],
    }),
  });

  $('#discard').addEventListener('click', () => void finish());

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const save = $<HTMLButtonElement>('#save');
    save.disabled = true;
    show('Speichere …');
    const edits = {
      title: $<HTMLInputElement>('#e-title').value,
      author: $<HTMLInputElement>('#e-author').value,
      published: $<HTMLInputElement>('#e-published').value,
      body: view.state.doc.toString(),
    };
    const result = await chrome.runtime.sendMessage({ type: 'save', payload, edits });
    if (result?.ok) {
      show(summaryText(result));
      await chrome.storage.session.remove(key);
      // Ohne Hinweise nach kurzer Bestätigung schließen; bei Warnungen oder fehlgeschlagenen Bildern offen lassen
      if (result.warnings.length === 0 && result.imagesFailed === 0) setTimeout(() => void finish(), 1200);
    } else {
      show(result?.error ?? 'Unbekannter Fehler', true);
      save.disabled = false;
    }
  });
}

void main();
