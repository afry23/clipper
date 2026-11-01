import { loadSettings, saveSettings, type Settings } from '../lib/settings';

const form = document.querySelector<HTMLFormElement>('#form')!;
const status = document.querySelector<HTMLElement>('#status')!;
const field = <T extends HTMLElement>(id: keyof Settings) => document.querySelector<T>(`#${id}`) as T;

function fill(settings: Settings): void {
  field<HTMLInputElement>('subfolder').value = settings.subfolder;
  field<HTMLInputElement>('folderTemplate').value = settings.folderTemplate;
  field<HTMLSelectElement>('format').value = settings.format;
  field<HTMLInputElement>('downloadImages').checked = settings.downloadImages;
  field<HTMLInputElement>('preview').checked = settings.preview;
  field<HTMLInputElement>('leadImage').checked = settings.leadImage;
  field<HTMLInputElement>('paginate').checked = settings.paginate;
  field<HTMLInputElement>('preferSinglePage').checked = settings.preferSinglePage;
  field<HTMLInputElement>('maxPages').value = String(settings.maxPages);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const saved = await saveSettings({
      subfolder: field<HTMLInputElement>('subfolder').value,
      folderTemplate: field<HTMLInputElement>('folderTemplate').value,
      format: field<HTMLSelectElement>('format').value as Settings['format'],
      downloadImages: field<HTMLInputElement>('downloadImages').checked,
      preview: field<HTMLInputElement>('preview').checked,
      leadImage: field<HTMLInputElement>('leadImage').checked,
      paginate: field<HTMLInputElement>('paginate').checked,
      preferSinglePage: field<HTMLInputElement>('preferSinglePage').checked,
      maxPages: Number(field<HTMLInputElement>('maxPages').value),
    });
    fill(saved); // zeigt bereinigte Werte
    status.classList.remove('error');
    status.textContent = 'Gespeichert';
  } catch (error) {
    status.classList.add('error');
    status.textContent = error instanceof Error ? error.message : String(error);
  }
});

void loadSettings().then(fill);
