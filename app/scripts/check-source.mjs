import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import ts from 'typescript';

const excludedDirectories = new Set([
  '.git',
  '.claude',
  '.cordis',
  'node_modules',
  'dist',
]);
const generatedFiles = new Set(['pnpm-lock.yaml']);
const textExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.json',
  '.md',
  '.css',
  '.html',
  '.yml',
  '.yaml',
]);
const failures = [];

// Components that take a `title` prop of their own; the rule below only exists
// to keep native HTML tooltips out of the pages.
const contentTitleOwners = new Set(['EmptyState', 'SettingsSection', 'SpaceDialog']);

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
        failures.push(`${path}: dynamic module loading is forbidden`);
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
          `${path}: native title attributes are forbidden; use shared/ui/tooltip for hover hints`,
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
