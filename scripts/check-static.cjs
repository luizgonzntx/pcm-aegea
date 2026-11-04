const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let checked = 0;
for (const directory of ['teresina', 'dist']) {
  const base = path.join(root, directory);
  for (const file of ['index.html', 'admin.html', 'style.css', 'app.js']) {
    const content = fs.readFileSync(path.join(base, file), 'utf8');
    const links = file.endsWith('.html')
      ? [...content.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1])
      : [...content.matchAll(/(?:url\(['"]?|['"])(assets\/[^'"\s)]+)/g)].map(match => match[1]);
    for (const link of links) {
      if (/^(?:https?:|data:|#)/.test(link)) continue;
      const target = path.resolve(base, link.split('?')[0]);
      assert.ok(fs.existsSync(target), `${directory}/${file}: recurso ausente: ${link}`);
      checked++;
    }
  }
  const worker = fs.readFileSync(path.join(base, 'import-worker.js'), 'utf8');
  assert.match(worker, /core\.js/);
  for (const filename of ['core.js', 'import-worker.js', 'inventory.js', 'ui.js', 'config.js']) {
    assert.ok(fs.statSync(path.join(base, filename)).size > 0);
  }
}
console.log(`Arquivos estáticos: ${checked} referências locais verificadas na origem e na publicação.`);
