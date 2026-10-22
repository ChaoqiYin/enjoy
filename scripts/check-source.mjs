import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import ts from 'typescript';

const excludedDirectories = new Set([
  '.git',
  'node_modules',
  'target',
  'dist',
  'gen',
  'prototype-drawing',
]);
const generatedFiles = new Set(['package-lock.json', 'Cargo.lock']);
const textExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.rs',
  '.json',
  '.md',
  '.css',
  '.html',
  '.toml',
  '.yml',
  '.yaml',
]);
const contentTitleOwners = new Set([
  'EmptyState',
  'SettingsSection',
  'Drawer',
  'SpaceDialog',
  'EmptyRescanConfirmation',
]);
// The one module allowed to reach for a module at run time, and the one thing
// it may reach for: a plugin's interface is a file outside this build, so the
// module that loads one has to import it by an address the kernel hands over —
// and that address is built by `pluginEntryUrl`, in that file, from the path
// the kernel gave. The exception is a name rather than a hole, and the file it
// names is the file a reviewer reads.
const pluginHostModule = join('frontend', 'src', 'plugins', 'host.ts');
const failures = [];

function jsxElementName(tagName) {
  return ts.isIdentifier(tagName) ? tagName.text : undefined;
}

function* files(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) yield* files(path);
    } else if (entry.isFile() && !generatedFiles.has(entry.name)) yield path;
  }
}

function inspectJavaScript(path, source) {
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  let declarationsStarted = false;
  for (const statement of ast.statements) {
    const dependency =
      ts.isImportDeclaration(statement) ||
      ts.isImportEqualsDeclaration(statement);
    const directive =
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteral(statement.expression);
    if (dependency && declarationsStarted)
      failures.push(`${path}: imports must precede declarations`);
    if (!dependency && !directive) declarationsStarted = true;
  }
  function visit(node) {
    if (ts.isImportEqualsDeclaration(node))
      failures.push(`${path}: import assignments are forbidden`);
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (ts.isIdentifier(expression) && expression.text === 'require') {
        failures.push(`${path}: dynamic module loading is forbidden`);
      }
      if (expression.kind === ts.SyntaxKind.ImportKeyword) {
        // The argument has to be a call to `pluginEntryUrl` — the address of a
        // plugin interface's own entry — so that what the plugin host reaches
        // for is a path the kernel handed over and nothing else. Which file a
        // plugin's directory is, and that the path stays inside it, is the
        // kernel's half of the promise (`PluginBootstrap.entry`); what is
        // held here is that the interface only ever asks for that.
        const [target] = node.arguments;
        const ofPluginEntry =
          target !== undefined &&
          ts.isCallExpression(target) &&
          ts.isIdentifier(target.expression) &&
          target.expression.text === 'pluginEntryUrl';
        if (path !== pluginHostModule) {
          failures.push(`${path}: dynamic module loading is forbidden`);
        } else if (!ofPluginEntry) {
          failures.push(
            `${path}: a dynamic import must be of pluginEntryUrl(...), the path the kernel handed over`,
          );
        }
      }
    }
    if (ts.isJsxAttribute(node) && node.name.getText() === 'title') {
      const owner = node.parent.parent;
      const element =
        ts.isJsxOpeningElement(owner) || ts.isJsxSelfClosingElement(owner)
          ? jsxElementName(owner.tagName)
          : undefined;
      if (!contentTitleOwners.has(element)) {
        failures.push(
          `${path}: native title attributes are forbidden; use shared/Tooltip for hover hints`,
        );
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}

for (const path of files('.')) {
  if (!textExtensions.has(extname(path))) continue;
  const source = readFileSync(path, 'utf8');
  // A conflict left in a merge is invisible to every other check here — it
  // compiles as often as not, and the prose around it still reads fine. The
  // pair of angle brackets is always wrong; the `=======` that a Markdown
  // setext heading legitimately uses only counts between the other two.
  const conflict =
    /^(?:<<<<<<< |>>>>>>> )/m.test(source) ||
    /^<<<<<<< .*$[\s\S]*?^=======$[\s\S]*?^>>>>>>> .*$/m.test(source);
  if (conflict) {
    failures.push(`${path}: merge conflict markers are left in the file`);
  }
  const lines = source.split('\n').length - (source.endsWith('\n') ? 1 : 0);
  if (lines > 500) failures.push(`${path}: ${lines} lines exceeds 500`);
  if (/\.(?:tsx?|m?js)$/.test(path)) inspectJavaScript(path, source);
}
assert.equal(failures.length, 0, failures.join('\n'));
console.log('Source length and static import checks passed.');
