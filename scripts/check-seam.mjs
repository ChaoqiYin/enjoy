import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

// The shapes that cross the seam between the interface and the backend.
//
// Every answer the backend gives is a Rust struct serialised into the window,
// and the interface reads it as a TypeScript interface. Those two declarations
// are the same fact written twice, in two languages, with nothing between them:
// a field renamed on one side still compiles, still builds, still passes every
// test (the call sites are mocked at `libraryApi`) and still passes every check
// — `check-commands.mjs` compares command *names* and says so outright. It fails
// only in a window, on the machine the build was installed on.
//
// That is the same shape of fault as the three checks beside this one, and this
// is the same kind of answer: keep both copies, hold them to each other. The
// copies are not merged because they are not the same thing — one is a
// serialisation contract, the other is what the interface is allowed to read —
// and because the seam is the one place in this application where two languages
// meet, which is exactly where a check is cheaper than a discipline.
//
// What is compared is the set of names, not the types: `Option<i64>` beside
// `number | null` is a conversion this check would have to re-implement to have
// an opinion about, and re-implementing it is a source of false failures that
// costs more than the mismatch it catches. The set of names is the part that
// nothing else covers.
//
// Two directions, both required:
//
// - every interface exported from the seam must be named in `pairs`, so a shape
//   added to the seam and forgotten here is a failure rather than a silence;
// - for each pair, the serialised field names and the declared member names
//   must be equal — a field the backend sends and the interface does not know is
//   a fact the user is never shown, and a member the interface reads and the
//   backend never sends is `undefined` at the one moment it matters.
//
// The seam is read from a list of files rather than from one path. The shapes
// were split into `apiTypes.ts` when the library listing needed two more of them
// and `api.ts` reached the line limit its module keeps — and a declaration that
// moved out from under this check would have taken the first rule above with it
// silently, which is the one failure this check exists to make loud. A file is
// listed here because the interface's seam declarations live in it; `api.ts` is
// still one of them, because the answers are handed on from there.

const seam = [join('frontend', 'src', 'shared', 'api.ts'), join('frontend', 'src', 'shared', 'apiTypes.ts')];
const where = seam.join(', ');

/**
 * One shape, both of its declarations. `rust` is `file` and the struct in it;
 * `ts` is the interface of that name in the seam.
 *
 * `struct` is named rather than guessed: a file can hold more than one, and
 * several of these files hold shapes that do not cross the seam at all.
 */
const pairs = [
  { rust: 'src-tauri/src/model.rs', struct: 'VideoFile', ts: 'Video' },
  { rust: 'src-tauri/src/model.rs', struct: 'Space', ts: 'Space' },
  { rust: 'src-tauri/src/error.rs', struct: 'AppError', ts: 'AppError' },
  { rust: 'src-tauri/src/scan/control.rs', struct: 'ScanStatus', ts: 'ScanStatus' },
  {
    rust: 'src-tauri/src/repository/mod.rs',
    struct: 'IndexChanges',
    ts: 'IndexChanges',
  },
  {
    rust: 'src-tauri/src/update/release.rs',
    struct: 'AvailableUpdate',
    ts: 'AvailableUpdate',
  },
  {
    rust: 'src-tauri/src/update/release.rs',
    struct: 'UpdateCheck',
    ts: 'UpdateCheck',
  },
  {
    rust: 'src-tauri/src/update/transfer.rs',
    struct: 'UpdateProgress',
    ts: 'UpdateProgress',
  },
  {
    rust: 'src-tauri/src/i18n/language.rs',
    struct: 'LanguageSettings',
    ts: 'LanguageSettings',
  },
  {
    rust: 'src-tauri/src/share/control.rs',
    struct: 'ShareStatus',
    ts: 'ShareStatus',
  },
  {
    rust: 'src-tauri/src/share/addresses.rs',
    struct: 'Address',
    ts: 'Address',
  },
  {
    rust: 'src-tauri/src/share/activity.rs',
    struct: 'Device',
    ts: 'Device',
  },
  {
    rust: 'src-tauri/src/settings.rs',
    struct: 'SettingsState',
    ts: 'SettingsState',
  },
  // The listing: what one page of the library is asked for, and what comes back.
  { rust: 'src-tauri/src/model.rs', struct: 'VideoQuery', ts: 'VideoQuery' },
  { rust: 'src-tauri/src/model.rs', struct: 'VideoPage', ts: 'VideoPage' },
];

const failures = [];

const toCamelCase = (name) =>
  name.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());

/**
 * The names a struct puts on the wire, in the order they are declared.
 *
 * `rename_all` is honoured because most of these structs use it, `#[serde(skip)]`
 * because one of them keeps a field the interface has no business reading, and a
 * per-field `rename` because that is the escape hatch a shape would reach for
 * before giving up the naming convention. An `rename_all` this check does not
 * know is a failure: silently comparing against the wrong convention would hide
 * exactly the drift it is here to find.
 */
function rustNames(file, struct) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const declaration = lines.findIndex((line) =>
    line.startsWith(`pub struct ${struct} {`),
  );
  if (declaration < 0) {
    failures.push(`${file}: no \`pub struct ${struct} {\` declaration`);
    return null;
  }
  const attributes = [];
  for (let line = declaration - 1; line >= 0; line -= 1) {
    if (!lines[line].trimStart().startsWith('#[')) break;
    attributes.push(lines[line]);
  }
  const renameAll = attributes
    .join(' ')
    .match(/rename_all\s*=\s*"([^"]+)"/)?.[1];
  if (renameAll !== undefined && renameAll !== 'camelCase') {
    failures.push(`${file}: ${struct} renames fields as ${renameAll}, which this check does not know`);
    return null;
  }
  const names = [];
  const pending = [];
  for (let line = declaration + 1; line < lines.length; line += 1) {
    const text = lines[line].trim();
    if (text === '}') break;
    if (text.startsWith('#[')) {
      pending.push(text);
      continue;
    }
    // Doc comments sit between fields; nothing else may.
    if (text === '' || text.startsWith('//')) continue;
    const field = text.match(/^(?:pub\s+)?(\w+)\s*:/);
    if (!field) {
      failures.push(`${file}: ${struct} has a line this check cannot read: ${text}`);
      break;
    }
    const serde = pending.join(' ');
    if (/serde\s*\(\s*skip\b/.test(serde)) {
      // Kept off the wire on purpose, so the interface must not have it.
      pending.length = 0;
      continue;
    }
    const renamed = serde.match(/rename\s*=\s*"([^"]+)"/)?.[1];
    names.push(renamed ?? (renameAll ? toCamelCase(field[1]) : field[1]));
    pending.length = 0;
  }
  return names;
}

/** The statements of each file the seam is read from, parsed once each. */
function seamSources() {
  return seam.map((path) =>
    ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    ),
  );
}

/** The members an interface declares, in the order they are declared. */
function typescriptNames(name) {
  for (const source of seamSources()) {
    for (const statement of source.statements) {
      if (
        ts.isInterfaceDeclaration(statement) &&
        statement.name.text === name
      ) {
        return statement.members.map((member) =>
          member.name && ts.isIdentifier(member.name) ? member.name.text : null,
        );
      }
    }
  }
  failures.push(`${where}: no \`export interface ${name}\``);
  return null;
}

/** Every interface the seam exports, which is every shape it may hand out. */
function exportedInterfaces() {
  return seamSources().flatMap((source) =>
    source.statements
      .filter(
        (statement) =>
          ts.isInterfaceDeclaration(statement) &&
          statement.modifiers?.some(
            (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
          ),
      )
      .map((statement) => statement.name.text),
  );
}

const named = new Set(pairs.map((pair) => pair.ts));
for (const exported of exportedInterfaces()) {
  if (!named.has(exported)) {
    failures.push(
      `${where}: ${exported} crosses the seam and is not among the pairs this check holds to each other`,
    );
  }
}

const compare = (a, b) =>
  [...a].filter((name) => !b.has(name)).map((name) => `\`${name}\``).join(', ');

let fields = 0;
for (const pair of pairs) {
  const rust = rustNames(pair.rust, pair.struct);
  const typescript = typescriptNames(pair.ts);
  if (!rust || !typescript) continue;
  if (typescript.includes(null)) {
    failures.push(`${seam}: ${pair.ts} has a member this check cannot read`);
    continue;
  }
  fields += rust.length;
  const sent = new Set(rust);
  const read = new Set(typescript);
  const unsent = compare(read, sent);
  const unknown = compare(sent, read);
  if (unsent) {
    failures.push(
      `${pair.ts} reads ${unsent}, which ${pair.struct} never sends`,
    );
  }
  if (unknown) {
    failures.push(
      `${pair.struct} sends ${unknown}, which ${pair.ts} does not know: nobody is shown it`,
    );
  }
}

assert.equal(failures.length, 0, failures.join('\n'));

console.log(
  `Every shape across the seam agrees: ${pairs.length} pairs, ${fields} fields`,
);
