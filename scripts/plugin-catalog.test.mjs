import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { artifacts, catalogFailures, catalogPath, readCatalog, render } from './plugin-catalog.mjs';

// What the catalog has to hold is `check-plugins.mjs`'s subject; these tests are
// about the two halves that can go wrong silently:
//
// - a generated file that no longer says what the catalog says, which is the
//   whole reason the files are generated rather than written by hand;
// - a gate that cannot tell, which would make the first point moot.
//
// The gate is run as a process against a copy of the tree, because that is how
// `npm run check` runs it, and because a gate is only worth having if it fails
// on the tree it is pointed at. The copies are what let both directions be
// exercised: the repository's own files stay untouched.

// Not `new URL('..', import.meta.url)`: Vitest runs this file through Vite, and
// Vite rewrites that exact shape into an asset URL, which is not a `file:` URL
// and so is not something `fileURLToPath` accepts.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const check = join(here, 'check-plugins.mjs');

/**
 * A throwaway tree holding the catalog and the files generated from it.
 *
 * `.prettierrc.json` is in the copy because the TypeScript is rendered through
 * Prettier with the options found by walking up from the file, and a copy
 * without it would render differently for a reason that has nothing to do with
 * what the test is asking.
 */
function copyOfTheCatalog() {
  const root = mkdtempSync(join(tmpdir(), 'enjoy-plugins-'));
  for (const path of [catalogPath, '.prettierrc.json', ...artifacts.map((artifact) => artifact.path)]) {
    cpSync(join(repoRoot, path), join(root, path), { recursive: true });
  }
  return root;
}

function runTheGate(root) {
  const result = spawnSync(process.execPath, [check], { cwd: root, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe('the mount point catalog', () => {
  it('is well formed as it is committed', () => {
    expect(catalogFailures(readCatalog(repoRoot))).toEqual([]);
  });

  it('says the same thing as every file generated from it', async () => {
    const rendered = await render(repoRoot, readCatalog(repoRoot));
    const drifted = rendered
      .filter((artifact) => readFileSync(join(repoRoot, artifact.path), 'utf8') !== artifact.content)
      .map((artifact) => artifact.path);
    expect(drifted).toEqual([]);
  });
});

describe('the mount point gate', () => {
  it('passes on the tree as committed', () => {
    const { status, output } = runTheGate(repoRoot);
    expect(output).not.toBe('');
    expect(status).toBe(0);
  }, 30000);

  it('fails when the interface side drifts, and names it', () => {
    const root = copyOfTheCatalog();
    const drifted = artifacts.find((artifact) => artifact.side === 'interface');
    writeFileSync(join(root, drifted.path), '// hand-edited\n');
    const { status, output } = runTheGate(root);
    expect(status).toBe(1);
    expect(output).toContain(drifted.path);
  }, 30000);

  it('fails when the Rust side drifts, and names it', () => {
    const root = copyOfTheCatalog();
    const drifted = artifacts.find((artifact) => artifact.side === 'Rust');
    writeFileSync(join(root, drifted.path), '// hand-edited\n');
    const { status, output } = runTheGate(root);
    expect(status).toBe(1);
    expect(output).toContain(drifted.path);
  }, 30000);

  it('fails when the closed set of six grows', () => {
    const root = copyOfTheCatalog();
    const catalog = JSON.parse(readFileSync(join(root, catalogPath), 'utf8'));
    const [first] = catalog.mountPoints;
    catalog.mountPoints.push({ ...first, key: 'app.extra' });
    writeFileSync(join(root, catalogPath), JSON.stringify(catalog));
    const { status, output } = runTheGate(root);
    expect(status).toBe(1);
    expect(output).toContain('closed set of six');
  }, 30000);

  it('fails when the catalog points at a member type nothing declares', () => {
    const root = copyOfTheCatalog();
    const catalog = JSON.parse(readFileSync(join(root, catalogPath), 'utf8'));
    catalog.mountPoints.at(-1).params = [{ name: 'video', type: 'Missing' }];
    writeFileSync(join(root, catalogPath), JSON.stringify(catalog));
    const { status, output } = runTheGate(root);
    expect(status).toBe(1);
    expect(output).toContain('Missing');
  }, 30000);

  it('fails when a mount point is called without the space it is in', () => {
    const root = copyOfTheCatalog();
    const catalog = JSON.parse(readFileSync(join(root, catalogPath), 'utf8'));
    catalog.mountPoints.find((entry) => entry.key === 'app.page').params = [];
    writeFileSync(join(root, catalogPath), JSON.stringify(catalog));
    const { status, output } = runTheGate(root);
    expect(status).toBe(1);
    expect(output).toContain('SpaceRef');
  }, 30000);

  it('fails when a chain mount point is asked without the values it already has', () => {
    const root = copyOfTheCatalog();
    const catalog = JSON.parse(readFileSync(join(root, catalogPath), 'utf8'));
    const fields = catalog.mountPoints.find((entry) => entry.key === 'video.fields');
    fields.params = fields.params.filter((member) => member.type !== 'SourcedFieldValue[]');
    writeFileSync(join(root, catalogPath), JSON.stringify(catalog));
    const { status, output } = runTheGate(root);
    expect(status).toBe(1);
    expect(output).toContain('SourcedFieldValue');
  }, 30000);
});
