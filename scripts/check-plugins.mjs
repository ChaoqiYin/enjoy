import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { artifacts, catalogFailures, catalogPath, readCatalog, render } from './plugin-catalog.mjs';

// The six mount points are written down in four places: the Rust host that
// dispatches on them, the interface that renders them, the page a plugin author
// reads, and the catalog. The first three are generated from the fourth, which
// is what makes this check possible: instead of comparing four hand-written
// lists — three of which take part in no compile, no test and no build, so a
// drift in any of them survives until someone writes a plugin against a mount
// point that is not there — it renders the catalog and holds each file to it.
//
// So there are two things to report, and they are different faults:
//
// - the catalog itself is malformed, which is a mistake in the one hand-written
//   copy and is reported with the rule it broke;
// - a generated file is not what the catalog says, which is either a hand edit
//   to a generated file or a catalog change nobody regenerated. Both are fixed
//   the same way, and the message says so.
//
// Which half of the pair is the source is a decision recorded in
// docs/adr/0045-挂载点分两半且是封闭集.md §6: the catalog is generated *from*,
// not compared *with*, because at this point there is nothing on either side to
// compare against yet — #84 and #85 are what will consume these files, and until
// they land a comparison would guard nothing at all.
//
// The paths are read from the working directory, like the checks beside this
// one. That is also what lets the test point this gate at a copy of the tree and
// watch it fail, which is the only way to know it can.

const failures = [];
const root = process.cwd();

let catalog;
try {
  catalog = readCatalog(root);
} catch (error) {
  failures.push(`${catalogPath}: cannot be read — ${error.message}`);
}

const malformed = catalog === undefined ? [] : catalogFailures(catalog);
failures.push(...malformed);

// A catalog this check cannot read is not a basis for rendering anything: the
// rendering would report every file as drifted, which buries the one line that
// says what is actually wrong.
if (catalog !== undefined && malformed.length === 0) {
  for (const artifact of await render(root, catalog)) {
    const path = join(root, artifact.path);
    if (!existsSync(path)) {
      failures.push(`${artifact.path}: has never been generated — run \`npm run generate:plugins\``);
    } else if (readFileSync(path, 'utf8') !== artifact.content) {
      failures.push(
        `${artifact.path}: does not say what ${catalogPath} says — run \`npm run generate:plugins\``,
      );
    }
  }
}

assert.equal(failures.length, 0, failures.join('\n'));

console.log(
  `The mount points agree with ${catalogPath}: ${catalog.mountPoints.length} of them, ` +
    `${Object.keys(catalog.types).length} shapes and ${Object.keys(catalog.enums).length} enums, ` +
    `and the ${artifacts.length} files generated from it are what it says.`,
);
