import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import ts from 'typescript';

const excludedDirectories = new Set(['.git', 'node_modules', 'target', 'dist', 'gen']);
const generatedFiles = new Set(['package-lock.json', 'Cargo.lock']);
const textExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.rs', '.json', '.md', '.css', '.html', '.toml', '.yml', '.yaml']);
const failures = [];

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
    const dependency = ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement);
    const directive = ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression);
    if (dependency && declarationsStarted) failures.push(`${path}: imports must precede declarations`);
    if (!dependency && !directive) declarationsStarted = true;
  }
  function visit(node) {
    if (ts.isImportEqualsDeclaration(node)) failures.push(`${path}: import assignments are forbidden`);
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(expression) && expression.text === 'require')) {
        failures.push(`${path}: dynamic module loading is forbidden`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}

for (const path of files('.')) {
  if (!textExtensions.has(extname(path))) continue;
  const source = readFileSync(path, 'utf8');
  const lines = source.split('\n').length - (source.endsWith('\n') ? 1 : 0);
  if (lines > 500) failures.push(`${path}: ${lines} lines exceeds 500`);
  if (/\.(?:tsx?|m?js)$/.test(path)) inspectJavaScript(path, source);
}
assert.equal(failures.length, 0, failures.join('\n'));
console.log('Source length and static import checks passed.');
