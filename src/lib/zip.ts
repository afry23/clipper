import { zipSync } from 'fflate';

/** Bilder sind bereits komprimiert → ohne Deflate speichern, Text mit Deflate. */
export function buildZip(files: { path: string; data: Uint8Array }[]): Uint8Array {
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  for (const { path, data } of files) entries[path] = [data, { level: path.endsWith('.md') ? 6 : 0 }];
  return zipSync(entries);
}
