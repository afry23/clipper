# Clipper

Browser-Extension (Chrome und Firefox, Manifest V3), die Webseiten als Markdown speichert – mit lokalen Bildern, damit der Artikel offline lesbar bleibt.

## Funktionen

- Hauptinhalt per Readability extrahieren, als Markdown mit YAML-Frontmatter speichern (`title`, `source`, `author`, `published`, `clipped`, `site`, `pages`, `description`).
- Bilder herunterladen (`srcset`, `<picture>`, Lazy-Load) und relativ unter `assets/` verlinken.
- Mehrseitige Artikel erkennen (`rel="next"`, Pager, „Weiter"-Links, Druckansicht) und zu einem Dokument zusammenführen.
- Links bleiben als absolute URLs erhalten.
- Werbeblöcke und Video-Player (z. B. `div.ad`, `<a-video>`) werden vor der Extraktion entfernt.
- Titelbild: Liegt es außerhalb des Artikelkörpers, wird `og:image` vorangestellt (abschaltbar).
- Optional: Editor mit Markdown-Vorschau vor dem Speichern, ZIP-Ausgabe, Auswahl-Clip.

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

### Editor (Vorschau)

Ist „Vorschau vor dem Speichern" aktiv, öffnet sich nach dem Clippen ein eigenes Popup-Fenster (kein Toolbar-Popup, das sich bei Klick daneben schließt):

- Titel, Autor und Datum ändern sowie den gesamten Markdown-Text bearbeiten (CodeMirror 6 mit Markdown-Highlighting).
- Die Bild-Platzhalter `clipper-img:N` im Text nicht ändern; beim Speichern werden sie durch `assets/<name>` ersetzt. Bilder, die du aus dem Text löschst, werden nicht heruntergeladen.
- „Speichern" oder „Verwerfen" schließt das Fenster und aktiviert den geclippten Artikel-Tab wieder. Bei Warnungen oder nicht ladbaren Bildern bleibt es offen, damit du die Hinweise siehst.
- Der Entwurf liegt bis dahin in `chrome.storage.session`.
- Das Kontextmenü speichert immer direkt, ohne Editor.

### Speichern-unter-Dialog

Fragt Chrome bei jeder Datei nach dem Speicherort, ist die Browser-Einstellung „Vor dem Download Speicherort abfragen" aktiv. Sie überstimmt die Erweiterung. Abhilfe: unter `chrome://settings/downloads` ausschalten, oder in den Einstellungen das Format „ZIP-Datei" wählen (nur eine Datei).

Einstellungen: im Popup „Einstellungen" (Zielordner, Ordnername-Vorlage `{date}` `{title}` `{site}`, Format, Bilder, Vorschau, Titelbild ergänzen, Pagination, Seitenlimit).

## Grenzen

- Nur Inhalte, die der Browser sieht; keine automatische Anmeldung.
- Folgeseiten werden als rohes HTML geladen (ohne JavaScript) und nur von derselben Domain.
- Bilder mit Hotlink-Schutz können fehlschlagen (Fallback: Original-URL).
- Eingebettete Videos/iframes werden zu Links; erkannte Werbe-Player werden ganz entfernt.
- Der Werbefilter ist bewusst eng gefasst. Andere Seiten brauchen unter Umständen weitere Selektoren (`AD_SELECTOR` in `src/lib/clip.ts`).
- Das Titelbild stammt aus `og:image` und kann auf manchen Seiten ein Logo oder eine Social-Card sein; dann im Editor löschen oder die Option ausschalten.
- Sehr große ZIP-Dateien können in Chrome an die Grenze von `data:`-URLs stoßen.

## Entwicklung

```sh
npm test             # Unit-Tests (Vitest, jsdom)
npm run typecheck
```

Struktur: `src/lib` (Extraktion, Werbefilter, Markdown, Bilder, Pagination, Einstellungen, Editor-Änderungen in `edits.ts`), `src/content` (läuft auf der Seite), `src/background` (Speichern, Downloads, Entwürfe), `src/popup`, `src/editor` (Editor-Fenster), `src/options`.
