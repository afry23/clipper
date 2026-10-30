import type { ArticleMeta } from './meta';

function yamlString(value: string): string {
  return JSON.stringify(value.replace(/\s+/g, ' ').trim());
}

export interface FrontmatterInput extends ArticleMeta {
  clipped: string;
  pages?: number;
}

/** Fehlende Felder werden weggelassen. */
export function buildFrontmatter(meta: FrontmatterInput): string {
  const lines: string[] = ['---'];
  if (meta.title) lines.push(`title: ${yamlString(meta.title)}`);
  lines.push(`source: ${yamlString(meta.source)}`);
  if (meta.author) lines.push(`author: ${yamlString(meta.author)}`);
  if (meta.published) lines.push(`published: ${meta.published}`);
  lines.push(`clipped: ${meta.clipped}`);
  if (meta.site) lines.push(`site: ${yamlString(meta.site)}`);
  if (meta.pages && meta.pages > 1) lines.push(`pages: ${meta.pages}`);
  if (meta.description) lines.push(`description: ${yamlString(meta.description)}`);
  lines.push('---', '');
  return lines.join('\n');
}
