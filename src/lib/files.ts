/** Erzeugt eine URL für `downloads.download`. Der Chrome-Service-Worker kennt kein createObjectURL → data:-URL. */
export function toDownloadUrl(content: string | Uint8Array, mime: string): string {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  if (typeof URL.createObjectURL === 'function') {
    return URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
