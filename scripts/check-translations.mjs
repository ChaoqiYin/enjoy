import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function read(language, namespace) {
  return JSON.parse(readFileSync(`shared/locales/${language}/${namespace}.json`, 'utf8'));
}
for (const namespace of ['common', 'errors', 'native']) {
  const english = read('en', namespace);
  const chinese = read('zh-CN', namespace);
  assert.deepEqual(Object.keys(english).sort(), Object.keys(chinese).sort());
  for (const key of Object.keys(english)) {
    const parameters = value => [...value.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]).sort();
    assert.deepEqual(parameters(english[key]), parameters(chinese[key]), `Parameter mismatch: ${key}`);
  }
}
const errors = read('en', 'errors');
function* rustFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* rustFiles(path);
    else if (entry.isFile() && entry.name.endsWith('.rs')) yield path;
  }
}

for (const file of rustFiles('src-tauri/src')) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/"((?:media|settings)\.[a-z_.]+)"/g)) {
    assert.ok(errors[match[1]], `Missing error translation: ${match[1]}`);
  }
}
console.log('Translation keys, parameters, and Rust error coverage verified.');
