export interface Settings {
  subfolder: string;
  folderTemplate: string;
  format: 'folder' | 'zip';
  downloadImages: boolean;
  paginate: boolean;
  maxPages: number;
  preferSinglePage: boolean;
  preview: boolean;
  leadImage: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  subfolder: 'Clips',
  folderTemplate: '{date}-{title}',
  format: 'folder',
  downloadImages: true,
  paginate: true,
  maxPages: 50,
  preferSinglePage: true,
  preview: false,
  leadImage: true,
};

/** Relativer Pfad unterhalb des Downloads-Ordners: keine `..`, keine absoluten Pfade, keine ungültigen Zeichen. */
export function sanitizeSubfolder(value: string): string {
  const parts = value
    .split(/[\\/]+/)
    .map((part) => part.replace(/[<>:"|?*\u0000-\u001f]/g, '').trim())
    .filter((part) => part && part !== '.' && part !== '..');
  return parts.join('/') || DEFAULT_SETTINGS.subfolder;
}

export function sanitizeSettings(raw: Partial<Settings>): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...raw };
  const maxPages = Math.round(Number(merged.maxPages));
  return {
    subfolder: sanitizeSubfolder(String(merged.subfolder)),
    folderTemplate: String(merged.folderTemplate).trim() || DEFAULT_SETTINGS.folderTemplate,
    format: merged.format === 'zip' ? 'zip' : 'folder',
    downloadImages: !!merged.downloadImages,
    paginate: !!merged.paginate,
    maxPages: Number.isFinite(maxPages) ? Math.min(200, Math.max(1, maxPages)) : DEFAULT_SETTINGS.maxPages,
    preferSinglePage: !!merged.preferSinglePage,
    preview: !!merged.preview,
    leadImage: !!merged.leadImage,
  };
}

export async function loadSettings(): Promise<Settings> {
  return sanitizeSettings(await chrome.storage.sync.get(DEFAULT_SETTINGS));
}

export async function saveSettings(settings: Partial<Settings>): Promise<Settings> {
  const clean = sanitizeSettings(settings);
  await chrome.storage.sync.set(clean);
  return clean;
}
