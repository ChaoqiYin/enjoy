import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The version is written in three places and the updater only reads one of
// them when it stamps a release. A mismatch still builds and still publishes;
// it just advertises a version older than the build, so no client ever sees an
// update and nothing reports an error. That is why this is a check rather than
// a note to remember.
const version = JSON.parse(
  readFileSync(join('.', 'package.json'), 'utf8'),
).version;
assert.match(
  version,
  /^\d+\.\d+\.\d+$/,
  `package.json version is not a plain semantic version: ${version}`,
);

const tauri = JSON.parse(
  readFileSync(join('src-tauri', 'tauri.conf.json'), 'utf8'),
).version;
assert.equal(
  tauri,
  version,
  `tauri.conf.json version ${tauri} does not match package.json ${version}`,
);

// Anchored to the `[package]` section: dependency lines are written like
// `rusqlite= {version="0.31", ...}` and must not be mistaken for it.
const cargo = readFileSync(join('src-tauri', 'Cargo.toml'), 'utf8').match(
  /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m,
)?.[1];
assert.equal(
  cargo,
  version,
  `Cargo.toml version ${cargo} does not match package.json ${version}`,
);

console.log(
  `Version ${version} agrees across package.json, tauri.conf.json and Cargo.toml.`,
);
