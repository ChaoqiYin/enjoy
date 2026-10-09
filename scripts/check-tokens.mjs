import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The design tokens in `frontend/src/style.css` are the single source of truth
// for every surface the interface draws, and their intended values are written
// down in exactly one other place: the two prototype design documents. Nothing
// else compares the two, so a token retuned to the wrong hex still builds,
// still renders and still passes every test — the drift only surfaces in a
// visual review. Hence this check.
//
// The expected values below are transcribed from
// `prototype-drawing/vermilion_studio/DESIGN.md` (light) and
// `prototype-drawing/crimson_cinema/DESIGN.md` (dark). Both documents disagree
// with themselves: their front-matter block carries an M3 light tint for
// `primary` (`#b80035` / `#ffb3b2`), while the compiled block at the end of
// each file paints the buttons with the brand red (`#e11d48` / `#ff334b`). The
// compiled block wins — it is the value the drawings actually use — and
// `primary-foreground` follows its `on-primary`.

const style = readFileSync(join('frontend', 'src', 'style.css'), 'utf8');

/** The declarations between the braces that follow `selector`. */
function block(selector) {
  const at = style.indexOf(`${selector} {`);
  assert.notEqual(at, -1, `style.css declares ${selector}`);
  const open = style.indexOf('{', at);
  const close = style.indexOf('}', open);
  return style.slice(open + 1, close);
}

/** The value of `--name` inside a token block, or a failure if it is absent.
 *  Hex digits are folded to lower case: prettier rewrites them that way, and
 *  the case of a hex literal carries no meaning to compare. */
function token(body, name) {
  const match = body.match(new RegExp(`--${name}:\\s*([^;]+);`));
  assert.ok(match, `--${name} is declared`);
  return match[1].trim().toLowerCase();
}

const light = block(':root');
const dark = block("[data-theme='dark']");

// The five slots the ticket names, against the drawings.
const named = [
  ['light', light, 'background', '#faf8ff'],
  ['light', light, 'card', '#fcfcfd'],
  ['light', light, 'primary', '#e11d48'],
  ['light', light, 'destructive', '#ba1a1a'],
  ['light', light, 'ring', '#e11d48'],
  ['dark', dark, 'background', '#111317'],
  ['dark', dark, 'card', '#14171D'],
  ['dark', dark, 'primary', '#ff334b'],
  ['dark', dark, 'destructive', '#ffb4ab'],
  ['dark', dark, 'ring', '#ff334b'],
];
for (const [theme, body, name, value] of named) {
  assert.equal(
    token(body, name),
    value.toLowerCase(),
    `${theme} --${name} does not match the design document`,
  );
}

// shadcn ships no success / warning / info, so the three are ours to add. Each
// needs a foreground in both themes, and the semantics win where the drawings
// disagree with themselves: Crimson repaints its green as red, and success
// stays green anyway.
for (const [theme, body] of [
  ['light', light],
  ['dark', dark],
]) {
  for (const slot of ['success', 'warning', 'info']) {
    assert.ok(token(body, slot), `${theme} --${slot} is empty`);
    assert.ok(
      token(body, `${slot}-foreground`),
      `${theme} --${slot}-foreground is empty`,
    );
  }
}
assert.equal(token(light, 'success'), '#006855');
assert.equal(token(dark, 'success'), '#66dabf');
assert.equal(token(light, 'warning'), token(dark, 'warning'));

// The dark block has to actually flip the surfaces, not shadow them.
for (const name of [
  'background',
  'foreground',
  'card',
  'popover',
  'muted',
  'muted-foreground',
  'accent',
  'secondary',
  'border',
  'input',
]) {
  assert.notEqual(
    token(light, name),
    token(dark, name),
    `--${name} is the same in both themes`,
  );
}

// One focus hue: the drawings carry a cyan glow and a red one side by side,
// which is a draft that never converged.
assert.equal(token(light, 'ring'), token(light, 'primary'));
assert.equal(token(dark, 'ring'), token(dark, 'primary'));

// One radius for both themes. The drawings disagree — Vermilion bases at
// .25rem, Crimson at .5rem — and a per-theme value would resize every
// component the moment the theme flips, so the dark block must not redeclare.
assert.equal(token(light, 'radius'), '0.5rem');
assert.ok(!/--radius:/.test(dark), 'the dark block redeclares --radius');

// The dark variant follows the document attribute `ThemeSetting` writes, not
// shadcn's default `.dark` class, which nothing in this app sets.
assert.ok(
  style.includes(
    "@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));",
  ),
  'the dark variant is not bound to [data-theme=\'dark\']',
);

// daisyUI is gone, and with it the three patches that existed only to reach
// inside it: the macOS title-bar fix, the drawer's reduced-motion downgrade
// and the card's restated transition.
assert.ok(!/@plugin/.test(style), 'style.css still loads a daisyUI plugin');
for (const gone of ['--page-scroll-lock', 'drawer-side', '--video-card-shadow']) {
  assert.ok(!style.includes(gone), `style.css still patches ${gone}`);
}

console.log(
  'Design tokens match the two design documents in both themes, and daisyUI is gone.',
);
