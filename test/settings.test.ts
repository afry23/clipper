// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { folderName } from '../src/lib/naming';
import { DEFAULT_SETTINGS, sanitizeSettings, sanitizeSubfolder } from '../src/lib/settings';
import { buildZip } from '../src/lib/zip';

describe('sanitizeSubfolder', () => {
  it('entfernt .., absolute Pfade und ungültige Zeichen', () => {
    expect(sanitizeSubfolder('../../etc')).toBe('etc');
    expect(sanitizeSubfolder('/Clips//Web:Artikel/')).toBe('Clips/WebArtikel');
    expect(sanitizeSubfolder('C:\\x\\y')).toBe('C/x/y');
  });
  it('fällt bei leerem Wert auf den Standard zurück', () => {
    expect(sanitizeSubfolder('  ../ ')).toBe(DEFAULT_SETTINGS.subfolder);
  });
});

describe('sanitizeSettings', () => {
  it('begrenzt maxPages und korrigiert Format', () => {
    expect(sanitizeSettings({ maxPages: 9999 }).maxPages).toBe(200);
    expect(sanitizeSettings({ maxPages: 0 }).maxPages).toBe(1);
    expect(sanitizeSettings({ maxPages: NaN }).maxPages).toBe(DEFAULT_SETTINGS.maxPages);
    expect(sanitizeSettings({ format: 'tar' as never }).format).toBe('folder');
    expect(sanitizeSettings({ folderTemplate: '  ' }).folderTemplate).toBe(DEFAULT_SETTINGS.folderTemplate);
  });
});

describe('folderName', () => {
  const vars = { title: 'Über Äpfel', date: '2026-10-30', site: 'Beispiel Seite' };
  it('ersetzt Platzhalter', () => {
    expect(folderName('{date}-{title}', vars)).toBe('2026-10-30-uber-apfel');
    expect(folderName('{site}/{title}', vars)).toBe('beispiel-seite-uber-apfel');
  });
  it('liefert nie leere oder mehrteilige Namen', () => {
    expect(folderName('{site}', { ...vars, site: undefined })).toBe('2026-10-30-uber-apfel');
    expect(folderName('../{title}', vars)).not.toContain('/');
  });
});

describe('buildZip', () => {
  it('packt Dateien mit Pfaden', () => {
    const zip = buildZip([
      { path: 'a/index.md', data: new TextEncoder().encode('# Hi') },
      { path: 'a/assets/x.png', data: new Uint8Array([1, 2, 3]) },
    ]);
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual(['a/assets/x.png', 'a/index.md']);
    expect(new TextDecoder().decode(files['a/index.md'])).toBe('# Hi');
    expect([...files['a/assets/x.png']]).toEqual([1, 2, 3]);
  });
});
