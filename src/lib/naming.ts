import { slugify } from './slug';

export interface NameVars {
  title: string;
  date: string;
  site?: string;
}

/** Ordnername aus Vorlage mit {date}, {title}, {site}. Ergebnis ist immer ein einzelnes, gültiges Pfadsegment. */
export function folderName(template: string, vars: NameVars): string {
  const name = template
    .replace(/\{date\}/g, vars.date)
    .replace(/\{title\}/g, slugify(vars.title))
    .replace(/\{site\}/g, vars.site ? slugify(vars.site) : '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.\s]+|[-.\s]+$/g, '');
  return name || `${vars.date}-${slugify(vars.title)}`;
}
