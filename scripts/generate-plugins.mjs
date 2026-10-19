import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { catalogPath, readCatalog, render } from './plugin-catalog.mjs';

// The other half of `check-plugins.mjs`: it writes the files the catalog says.
// Run it after changing `shared/plugins/mount-points.json`; the check fails on a
// tree where this was forgotten, so a stale generated file cannot be committed
// quietly. The paths are read from the working directory, the same way the check
// reads them, so that both can be pointed at a copy of the tree.

const root = process.cwd();
const rendered = await render(root, readCatalog(root));
for (const artifact of rendered) {
  const path = join(root, artifact.path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, artifact.content);
  console.log(`wrote ${artifact.path}`);
}
console.log(`Generated ${rendered.length} files from ${catalogPath}.`);
