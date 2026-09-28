import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import ts from 'typescript';

// A command's name is written in four places and nothing else connects them:
// the call site that invokes it, the handler list the backend registers it in
// (`generate_handler!`), and the acceptance fixture that answers it. Each is a
// bare string. A name that drifts still compiles, still builds, still passes
// every test — the call sites are mocked at `libraryApi`, so nothing exercises
// the seam — and fails only in a window, at runtime, on the one machine that
// ran the build. That is why this is a check rather than a note to remember,
// the same reason `check-version.mjs` exists for a value written in three files.
//
// It compares sets, not parameters: the shapes are carried by the TypeScript
// signature on one side and the Rust signature on the other, and reading the
// latter would mean re-implementing Tauri's camelCase conversion here — a
// source of false failures that would cost more than the mismatch it catches.
// The fixture is held to a subset on purpose: it stands in for a backend whose
// walkthrough needs, not for all of it, so a command missing from it is not a
// fault. What it may not do is answer a name the backend never registered.
//
// The call sites are held to one file, which is the part of this that is a rule
// rather than a walk. The backend is one seam, and `shared/api.ts` is its
// address: it names every command, every pushed message, the settings, the
// language, the folder picker and the thumbnail URL, and everything else asks
// it. That is what makes this check complete. While the reaches were spread
// over four packages, a call site in a file this walker did not know about was
// simply not covered, and the walker could not say so.

const failures = [];

function* files(directory, wanted) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path, wanted);
    else if (entry.isFile() && wanted(path)) yield path;
  }
}

function parse(path) {
  return ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    extname(path) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/** Every `invoke('name')` call site, keyed by the file it was found in. */
function invokedCommands() {
  const found = new Map();
  const wanted = (path) =>
    /\.tsx?$/.test(path) &&
    !path.endsWith('.test.tsx') &&
    !path.endsWith('.test.ts');
  for (const path of files(join('frontend', 'src'), wanted)) {
    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'invoke'
      ) {
        const [argument] = node.arguments;
        // A call whose name is not a literal is invisible to this check, which
        // would leave a gap in the coverage this file exists to provide.
        if (!argument || !ts.isStringLiteral(argument)) {
          failures.push(
            `${path}: invoke() must be called with a literal command name`,
          );
        } else {
          found.set(argument.text, path);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(parse(path));
  }
  return found;
}

/**
 * The files that reach for the backend themselves.
 *
 * Read off the imports rather than off the calls, because a mention is not a
 * reach: several modules name `UnlistenFn` to say what stopping a subscription
 * answers with, and a type-only import is erased before anything runs. What is
 * a reach is importing the runtime itself.
 *
 * Reported rather than corrected: which file a reach belongs in is a decision,
 * and the one this check exists to keep is `backendAddress`.
 */
const backendAddress = join('frontend', 'src', 'shared', 'api.ts');

function reachingFiles() {
  const packages = [
    '@tauri-apps/api/core',
    '@tauri-apps/api/event',
    '@tauri-apps/plugin-dialog',
    '@tauri-apps/plugin-opener',
  ];
  const wanted = (path) =>
    /\.tsx?$/.test(path) &&
    !path.endsWith('.test.tsx') &&
    !path.endsWith('.test.ts');
  const reaching = new Set();
  for (const path of files(join('frontend', 'src'), wanted)) {
    for (const statement of parse(path).statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      if (statement.importClause?.isTypeOnly) continue;
      const from = statement.moduleSpecifier;
      if (ts.isStringLiteral(from) && packages.includes(from.text)) {
        reaching.add(path);
      }
    }
  }
  return reaching;
}

/** The command names the acceptance fixture answers. */
function fixtureCommands() {
  const found = new Map();
  const path = join('frontend', 'acceptance', 'web-fixture.ts');
  const visit = (node) => {
    if (ts.isCaseClause(node)) {
      if (!ts.isStringLiteral(node.expression)) {
        failures.push(
          `${path}: a fixture case label must be a literal command name`,
        );
      } else {
        found.set(node.expression.text, path);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(path));
  return found;
}

/** The commands the backend registers, read wherever the handler list lives. */
function registeredCommands() {
  const path = join('src-tauri', 'src');
  const lists = [];
  for (const file of files(path, (candidate) => candidate.endsWith('.rs'))) {
    const source = readFileSync(file, 'utf8');
    const match = source.match(/generate_handler!\[([\s\S]*?)\]/);
    if (match) lists.push([file, match[1]]);
  }
  // Searching rather than naming the file: moving the handler list to another
  // module is a refactor the guide invites, and a check pinned to `main.rs`
  // would fail on it for a reason that has nothing to do with commands.
  const found = lists.map(([file]) => file).join(', ');
  assert.equal(
    lists.length,
    1,
    `expected exactly one generate_handler! list, found ${lists.length}: ${found}`,
  );
  const [file, body] = lists[0];
  const names = body
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split('::').at(-1));
  assert.ok(names.length > 0, `${file}: the handler list is empty`);
  return new Map(names.map((name) => [name, file]));
}

const describe = (entries) =>
  [...entries].map(([name, file]) => `${name} (${file})`).join(', ');

const invoked = invokedCommands();
const registered = registeredCommands();
const fixture = fixtureCommands();

const reaching = [...reachingFiles()];
if (reaching.length !== 1 || reaching[0] !== backendAddress) {
  failures.push(
    `the backend is reached for from ${reaching.length} files, and it has one address (${backendAddress}): ${reaching.join(', ') || 'none'}`,
  );
}

const neverCalled = [...registered.keys()].filter((name) => !invoked.has(name));
const neverRegistered = new Set(
  [...invoked.keys()].filter((name) => !registered.has(name)),
);
if (neverRegistered.size > 0) {
  // The command name that reaches the backend has to be one it registered, so
  // this is the direction that fails at runtime.
  failures.push(
    `called but not registered: ${describe(
      [...neverRegistered].map((name) => [name, invoked.get(name)]),
    )}`,
  );
}
if (neverCalled.length > 0) {
  // A `#[tauri::command]` is reachable only through IPC, so one nothing invokes
  // is dead surface rather than a command waiting for a caller. Reported as a
  // failure to be deleted, not as a name to add a call site for.
  failures.push(
    `registered but nothing calls: ${describe(
      neverCalled.map((name) => [name, registered.get(name)]),
    )}`,
  );
}

const unknownToBackend = [...fixture.keys()].filter(
  (name) => !registered.has(name),
);
if (unknownToBackend.length > 0) {
  failures.push(
    `answered by the acceptance fixture but never registered: ${describe(
      unknownToBackend.map((name) => [name, fixture.get(name)]),
    )}`,
  );
}

assert.equal(failures.length, 0, failures.join('\n'));

const uncovered = [...registered.keys()].filter((name) => !fixture.has(name));
console.log(
  `Command names agree across ${invoked.size} call sites, ${registered.size} registered handlers and ${fixture.size} fixture cases` +
    (uncovered.length > 0
      ? `; ${uncovered.length} not answered by the acceptance fixture: ${uncovered.join(', ')}`
      : ''),
);
