# Clipper

Browser-Extension (Chrome und Firefox, Manifest V3), die Webseiten als Markdown speichert – mit lokalen Bildern, damit der Artikel offline lesbar bleibt.

## Funktionen

- Hauptinhalt per Readability extrahieren, als Markdown mit YAML-Frontmatter speichern (`title`, `source`, `author`, `published`, `clipped`, `site`, `pages`, `description`).
- Bilder herunterladen (`srcset`, `<picture>`, Lazy-Load) und relativ unter `assets/` verlinken.
- Mehrseitige Artikel erkennen (`rel="next"`, Pager, „Weiter"-Links, Druckansicht) und zu einem Dokument zusammenführen.
- Links bleiben als absolute URLs erhalten.
- Optional: Vorschau mit editierbaren Metadaten, ZIP-Ausgabe, Auswahl-Clip.

## Bauen

Voraussetzung: Node.js.

```sh
npm install
npm run build        # erzeugt dist/chrome und dist/firefox
```

## Installieren (Eigengebrauch)

**Chrome:** `chrome://extensions` → Entwicklermodus einschalten → „Entpackte Erweiterung laden" → Ordner `dist/chrome`.

**Firefox:** `about:debugging#/runtime/this-firefox` → „Temporäres Add-on laden" → `dist/firefox/manifest.json`. Temporäre Add-ons verschwinden beim Neustart von Firefox. Dauerhaft geht es nur mit Developer Edition/Nightly (Signaturpflicht abschaltbar) oder einer signierten Version.

Nach Code-Änderungen neu bauen und die Erweiterung in der Browser-Verwaltung neu laden.

## Benutzung

- Toolbar-Symbol klicken oder `Alt+Shift+C`. Ist Text markiert, wird nur die Auswahl gesichert.
- Rechtsklick: „Seite clippen" bzw. „Auswahl clippen"; das Ergebnis zeigt das Toolbar-Symbol kurz als ✓ oder !.
- Beim ersten Clip fragt die Erweiterung nach Zugriff auf alle Seiten. Ohne ihn können Bilder anderer Domains meist nicht geladen werden; im Markdown bleibt dann die Original-URL.
- Ergebnis: `Downloads/<Zielordner>/<Ordnername>/index.md` plus `assets/` (oder eine ZIP-Datei). Erneutes Clippen am selben Tag überschreibt.

Einstellungen: im Popup „Einstellungen" (Zielordner, Ordnername-Vorlage `{date}` `{title}` `{site}`, Format, Bilder, Vorschau, Pagination, Seitenlimit).

## Grenzen

- Nur Inhalte, die der Browser sieht; keine automatische Anmeldung.
- Folgeseiten werden als rohes HTML geladen (ohne JavaScript) und nur von derselben Domain.
- Bilder mit Hotlink-Schutz können fehlschlagen (Fallback: Original-URL).
- Eingebettete Videos/iframes werden zu Links.
- Sehr große ZIP-Dateien können in Chrome an die Grenze von `data:`-URLs stoßen.

## Entwicklung

```sh
npm test             # Unit-Tests (Vitest, jsdom)
npm run typecheck
```

Struktur: `src/lib` (Extraktion, Markdown, Bilder, Pagination, Einstellungen), `src/content` (läuft auf der Seite), `src/background` (Speichern, Downloads), `src/popup`, `src/options`.
