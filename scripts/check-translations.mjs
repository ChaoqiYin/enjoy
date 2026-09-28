import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function read(language, namespace) {
  const path = join('shared', 'locales', language, `${namespace}.json`);
  return JSON.parse(readFileSync(path, 'utf8'));
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

// Text the interface shows does not end in a full stop, in either language.
//
// A prompt is not a paragraph: the full stop at the end of "The share service is
// not running." is a mark nobody writes when speaking, and it makes every one of
// these read as an excerpt of something longer. Sentences inside a message still
// take theirs — the rule is about the last character — and a question keeps its
// question mark, which is the mark that carries meaning.
//
// The one exception is the landing page's body, which *is* a paragraph: it is
// shown to a browser as prose and its full stop is the paragraph's own. Written
// out by name rather than matched by shape, so that a second prose block has to
// be added to this list deliberately instead of slipping in under a pattern.
const prose = new Set(['native/shareLandingBody']);
for (const namespace of ['common', 'errors', 'native']) {
  for (const language of ['en', 'zh-CN']) {
    for (const [key, value] of Object.entries(read(language, namespace))) {
      if (prose.has(`${namespace}/${key}`)) continue;
      assert.ok(
        !/[.。]$/.test(value),
        `Ends in a full stop: ${language}/${namespace}.${key} — "${value}"`,
      );
    }
  }
}
const errors = read('en', 'errors');
// The families of error codes are read out of the translations rather than
// listed here, so a family this check should cover is covered from the moment
// it lands: a name added to the translations but forgotten in a list like this
// one would go unchecked, which is exactly the mistake this check exists to
// catch. A family that has no translations yet is still invisible to it, so the
// first code of a new family has to arrive together with its words.
const families = [
  ...new Set(Object.keys(errors).map((key) => key.split('.')[0])),
];
const errorCode = new RegExp(`"((?:${families.join('|')})\\.[a-z_.]+)"`, 'g');
function* rustFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* rustFiles(path);
    else if (entry.isFile() && entry.name.endsWith('.rs')) yield path;
  }
}

for (const file of rustFiles(join('src-tauri', 'src'))) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(errorCode)) {
    assert.ok(errors[match[1]], `Missing error translation: ${match[1]}`);
  }
}
console.log('Translation keys, parameters, and Rust error coverage verified.');
