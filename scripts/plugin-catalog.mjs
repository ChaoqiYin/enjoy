import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import prettier from 'prettier';
import { markdownSource, rustSource, typescriptSource } from './plugin-render.mjs';

// The six mount points are one fact written in three places: the Rust host that
// dispatches on them, the interface that renders them, and the page a plugin
// author reads. None of those copies takes part in a compile, so any of them can
// drift and stay drifted until someone writes a plugin against a mount point
// that does not exist. `shared/plugins/mount-points.json` is the one copy: this
// module holds the catalog and says what it must contain, `plugin-render.mjs`
// writes it out in the other three languages, and `check-plugins.mjs` fails when
// a generated file is not what the catalog says. Why a generated catalog rather
// than a comparison of two hand-written lists: docs/adr/0045-挂载点分两半且是封闭集.md §6.

/** The hand-written catalog, and the three files rendered out of it. */
export const catalogPath = join('shared', 'plugins', 'mount-points.json');

export const artifacts = [
  { side: 'Rust', path: join('src-tauri', 'src', 'plugins', 'mount_points.rs') },
  { side: 'interface', path: join('frontend', 'src', 'plugins', 'mountPoints.ts') },
  { side: 'authors', path: join('docs', '插件挂载点目录.md') },
];

/** The primitives a member type may be built from; everything else is named. */
const primitives = new Set(['string', 'number', 'boolean']);

export function readCatalog(root) {
  return JSON.parse(readFileSync(join(root, catalogPath), 'utf8'));
}

/**
 * What is wrong with the catalog itself, as a list of lines.
 *
 * The check reports these rather than throwing, so that a catalog with more than
 * one thing wrong says all of them at once — the shape `check-commands.mjs` uses.
 */
export function catalogFailures(catalog) {
  const failures = [];
  const fail = (message) => failures.push(`${catalogPath}: ${message}`);

  for (const glossary of ['categories', 'kinds', 'sides', 'scopes', 'mergeRules']) {
    const entries = catalog[glossary];
    if (entries === undefined || Object.keys(entries).length === 0) {
      fail(`the ${glossary} glossary is missing or empty`);
    }
  }
  const named = (glossary) => new Set(Object.keys(catalog[glossary] ?? {}));
  const categories = named('categories');
  const kinds = named('kinds');
  const sides = named('sides');
  const scopes = named('scopes');
  const merges = named('mergeRules');
  const shapes = new Set([
    ...Object.keys(catalog.types ?? {}),
    ...Object.keys(catalog.enums ?? {}),
  ]);

  // A member type is a primitive, a declared shape, or an array of either. A
  // name that resolves to nothing is the drift this catalog exists to prevent,
  // so it is reported rather than skipped.
  const unknownTypes = [];
  const checkMembers = (where, members) => {
    if (!Array.isArray(members)) {
      fail(`${where} is not a list of members`);
      return;
    }
    const seen = new Set();
    for (const member of members) {
      if (typeof member?.name !== 'string' || !/^[a-z][A-Za-z0-9]*$/.test(member.name)) {
        fail(`${where} has a member whose name is not camelCase: ${JSON.stringify(member?.name)}`);
        continue;
      }
      if (seen.has(member.name)) fail(`${where} declares ${member.name} twice`);
      seen.add(member.name);
      const base = String(member.type).replace(/\[\]$/, '');
      if (!primitives.has(base) && !shapes.has(base)) {
        unknownTypes.push(`${where}.${member.name}: ${member.type}`);
      }
    }
  };

  for (const [name, shape] of Object.entries(catalog.types ?? {})) {
    checkMembers(`type ${name}`, shape.fields);
  }

  const mountPoints = catalog.mountPoints;
  if (!Array.isArray(mountPoints)) {
    fail('mountPoints is missing');
    return failures;
  }
  // The set is closed (ADR 0045 §1): a seventh mount point is a change to that
  // decision, not a line added here.
  if (mountPoints.length !== 6) {
    fail(`the mount points are a closed set of six, found ${mountPoints.length}`);
  }
  const keys = new Set();
  for (const entry of mountPoints) {
    const key = entry?.key;
    if (typeof key !== 'string' || !/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(key)) {
      fail(`"${key}" is not a dotted lower-case mount point key`);
      continue;
    }
    if (keys.has(key)) fail(`${key} is declared twice`);
    keys.add(key);
    if (!categories.has(entry.category)) fail(`${key} has an unknown category: ${entry.category}`);
    if (!kinds.has(entry.kind)) fail(`${key} has an unknown kind: ${entry.kind}`);
    if (!sides.has(entry.side)) fail(`${key} has an unknown side: ${entry.side}`);
    // Only an interface category can belong to the interface half, and the three
    // others cannot: a plugin with no interface would never be asked for an
    // action or a flow event (ADR 0045 §2).
    if (entry.category === 'interface' !== (entry.side === 'interface')) {
      fail(`${key} is ${entry.category}, which belongs to ${entry.category === 'interface' ? 'the interface' : 'the body'}, not to ${entry.side}`);
    }
    if (!scopes.has(entry.scope)) fail(`${key} has an unknown scope: ${entry.scope}`);
    if (!merges.has(entry.merge)) fail(`${key} has an unknown merge rule: ${entry.merge}`);
    if (typeof entry.doc !== 'string' || entry.doc === '') fail(`${key} has no doc line`);
    if (!Array.isArray(entry.occupants) || entry.occupants.some((id) => typeof id !== 'string')) {
      fail(`${key} has an occupants list that is not a list of plugin ids`);
    }
    checkMembers(`${key} params`, entry.params);
    checkMembers(`${key} result`, entry.result);
    // Every call carries the space it is made in: a plugin's own data directory
    // is global, but the data it is shown always belongs to one space, so even
    // `app.page` — which points at no video — is called with one (spec #82,
    // 「参数是「完整上下文」，不是一条 id」).
    const params = Array.isArray(entry.params) ? entry.params : [];
    if (!params.some((member) => member?.type === 'SpaceRef')) {
      fail(`${key} is called without the space it is in — its params carry no SpaceRef`);
    }
    // A chain mount point is asked after the values it already has, so that the
    // plugin after it fills a gap rather than asking the same question again.
    if (entry.kind === 'chain' && !params.some((member) => member?.type === 'SourcedFieldValue[]')) {
      fail(
        `${key} is a chain mount point, so its params carry the values the chain already has (SourcedFieldValue[])`,
      );
    }
    // The two are the same fact said twice, and both sides read one of them: the
    // interface renders by kind, the host merges by rule.
    const expected = entry.kind === 'chain' ? 'first-non-empty' : 'overlay';
    if (entry.kind !== undefined && entry.merge !== expected) {
      fail(`${key} is a ${entry.kind} mount point, so its merge rule is ${expected}, not ${entry.merge}`);
    }
  }

  for (const unknown of unknownTypes) fail(`a member type resolves to nothing — ${unknown}`);
  return failures;
}

/**
 * The three files the catalog says, in the order `artifacts` lists them.
 *
 * `root` is a parameter rather than the working directory because the
 * TypeScript's Prettier options are found by walking up from the file being
 * rendered, which is why the test's copy of the tree carries `.prettierrc.json`
 * too — and why a renderer that reached for the working directory would make
 * that copy meaningless.
 */
export async function render(root, catalog) {
  const [rust, typescript, authors] = artifacts;
  const config = await prettier.resolveConfig(join(root, typescript.path));
  return [
    { ...rust, content: rustSource(catalog) },
    {
      ...typescript,
      content: await prettier.format(typescriptSource(catalog), {
        ...config,
        parser: 'typescript',
      }),
    },
    { ...authors, content: markdownSource(catalog) },
  ];
}
