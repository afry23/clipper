import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';

const targets = ['chrome', 'firefox'];
const base = JSON.parse(readFileSync('src/manifest.base.json', 'utf8'));

const manifestFor = {
  chrome: () => ({ ...base, background: { service_worker: 'background.js', type: 'module' } }),
  firefox: () => ({
    ...base,
    background: { scripts: ['background.js'], type: 'module' },
    browser_specific_settings: { gecko: { id: 'clipper@localhost', strict_min_version: '128.0' } },
  }),
};

for (const target of targets) {
  const out = `dist/${target}`;
  mkdirSync(out, { recursive: true });
  await build({
    entryPoints: {
      background: 'src/background/index.ts',
      popup: 'src/popup/popup.ts',
      options: 'src/options/options.ts',
      editor: 'src/editor/editor.ts',
    },
    outdir: out,
    bundle: true,
    format: 'esm',
    target: 'es2022',
    sourcemap: false,
  });
  // Content-Script wird per executeScript injiziert: IIFE statt ESM
  await build({
    entryPoints: { content: 'src/content/index.ts' },
    outdir: out,
    bundle: true,
    format: 'iife',
    target: 'es2022',
  });
  copyFileSync('src/popup/popup.html', `${out}/popup.html`);
  copyFileSync('src/editor/editor.html', `${out}/editor.html`);
  copyFileSync('src/options/options.html', `${out}/options.html`);
  writeFileSync(`${out}/manifest.json`, JSON.stringify(manifestFor[target](), null, 2));
  console.log(`built ${out}`);
}
