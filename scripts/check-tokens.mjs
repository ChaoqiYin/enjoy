import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

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
const components = readFileSync(
  join('frontend', 'src', 'components.css'),
  'utf8',
);

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

/** The value of the plain property `name` inside a block, for the one or two
 *  declarations in there that are not tokens. Anchored to the start of a line so
 *  that a custom property ending in the same words cannot answer for it. */
function declaration(body, name, where) {
  const match = body.match(new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm'));
  assert.ok(match, `${where} declares ${name}`);
  return match[1].trim().toLowerCase();
}

const light = block(':root');
const dark = block("[data-theme='dark']");

// The five slots the ticket names, against the drawings. One exception: the
// light `background` is `#f5f5f5`, not the document's `#faf8ff` — the user
// picked it, and the light `--field` beside it, off a screenshot of another
// application (ADR 0029). It is asserted here anyway rather than dropped from
// the list, because the value is still this file's to hold: the check exists to
// catch a token drifting, not to insist the document always won.
const named = [
  ['light', light, 'background', '#f5f5f5'],
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

// Which palette the *engine* paints with: the scrollbar beside every scrolling
// container, the internals of a form control, the `canvastext` keyword. Not a
// colour of this stylesheet's — nothing here reads it — and that is exactly why
// it needs holding: it is the one surface the theme switch cannot reach by
// itself, because the switch writes `data-theme` and the engine answers only to
// `color-scheme`, so a dark window kept a white scrollbar down its side
// (ADR 0040). The pair is asserted rather than one value, because the failure is
// silent and lands in one theme at a time: drop the dark line and the light
// theme is still perfect.
assert.equal(declaration(light, 'color-scheme', ':root'), 'light');
assert.equal(declaration(dark, 'color-scheme', "[data-theme='dark']"), 'dark');

// The lane a scrollbar takes, which is this interface's own number now that the
// bar is drawn (`components.css`, `.app-scrollbar`). It is asserted because it is
// the one token the layout can feel: `scrollbar-gutter` reserves it beside every
// scrolling container, so moving it moves the content column — the readings the
// ADRs and the guides carry are all taken at ten. The dark block must not
// redeclare it: the lane is not a theme's, it is a shape, the same rule `--radius`
// is under (ADR 0040).
assert.equal(token(light, 'scrollbar-width'), '10px');
assert.ok(
  !/--scrollbar-width:/.test(dark),
  'the dark block redeclares --scrollbar-width',
);

// And the two standard properties that would silently undo every drawn rule.
// `scrollbar-color` and `scrollbar-width` are the *standard* answer, and an
// element that has one is painted by the engine again: every
// `::-webkit-scrollbar` rule on it is dropped, `!important` and all. Measured,
// not assumed — with `scrollbar-color` set on a page wearing `.app-scrollbar`,
// the lane went back from 10 to the platform's 15 and the arrows came back
// (ADR 0040). Nobody would notice until they looked, which is what this file is
// for; the negative lookbehind keeps the token `--scrollbar-width` out of it.
for (const [name, sheet] of [
  ['style.css', style],
  ['components.css', components],
]) {
  assert.ok(
    !/(?<!-)\bscrollbar-(color|width)\s*:/.test(sheet),
    `${name} sets the standard scrollbar properties, which discard the drawn bar`,
  );
}

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

// Gone from the stylesheet is not gone from the source. The plugin's classes
// generate nothing now — no `btn`, no `progress`, no `loading` — so one left on
// an element is a control that silently draws with no colour, no size and no
// spinner, and a test cannot see it: jsdom lays nothing out and asserts no
// class names. The `@plugin` check above never looked here.

// daisyUI's class vocabulary, as the migration listed it
// (`docs/界面通用组件清单.md` §4, its `取代的 daisyUI` column) plus the surface
// helpers the scan panel carried. Matched as whole class tokens, so `bg-card`
// is not `card` and `border-input` is not `input`; a class is daisyUI's or
// Tailwind's, never both, and only the second list is matched by prefix.
const DAISY_CLASSES = new Set([
  'btn',
  'progress',
  'loading',
  'rounded-box',
  'badge',
  'alert',
  'card',
  'modal',
  'drawer',
  'dropdown',
  'menu',
  'input',
  'select',
  'checkbox',
  'radio',
  'toggle',
  'divider',
  'tab',
  'tabs',
  'join',
  'tooltip',
  'skeleton',
]);
const DAISY_PREFIXES = [
  'btn-',
  'badge-',
  'alert-',
  'card-',
  'modal-',
  'drawer-',
  'dropdown-',
  'menu-',
  'input-',
  'select-',
  'toggle-',
  'tab-',
  'tabs-',
  'join-',
  'loading-',
  'bg-base-',
  'text-base-content',
];
// Tailwind spells a few utilities with a prefix daisyUI also uses — `select-none`
// is not daisyUI's `select` — so they are named and excluded rather than left to
// turn the check into a nuisance that gets switched off.
const NOT_DAISY = new Set([
  'select-none',
  'select-all',
  'select-text',
  'select-auto',
]);

function isDaisyClass(token) {
  if (NOT_DAISY.has(token)) return false;
  return (
    DAISY_CLASSES.has(token) ||
    DAISY_PREFIXES.some((prefix) => token.startsWith(prefix))
  );
}

/** A word with the punctuation around it trimmed, so a class written inside a
 *  nested string in a template — `` `${on ? 'tab-active' : ''}` `` — is read as
 *  the class it is rather than as a word with quotes on. Only the ends are
 *  trimmed: `hover:bg-accent` and `bg-[hsl(var(--card))]` keep the shape that
 *  tells them apart from a daisyUI class. */
function classWord(word) {
  return word.replace(/^[^A-Za-z0-9-]+|[^A-Za-z0-9-]+$/g, '');
}

/** The index just past the string literal that opens at `at`, escapes and all.
 *  A template's `${…}` is skipped with it, which is right for the braces that
 *  bracket it — they balance inside — and wrong only for a template nested in a
 *  template, which no class attribute in this repository writes. */
function afterString(source, at) {
  const quote = source[at];
  let i = at + 1;
  while (i < source.length && source[i] !== quote) {
    i += source[i] === '\\' ? 2 : 1;
  }
  return i + 1;
}

/** The value of a class attribute starting at `at`, as source text: a quoted
 *  string (whose text is the value itself), or a braced expression read to the
 *  brace that closes it, so a conditional `className={a ? 'btn' : 'btn-x'}` and
 *  a call `className={cn('btn')}` are both read whole. */
function readClassValue(source, at) {
  const quote = source[at];
  if (quote === '"' || quote === "'" || quote === '`') {
    const end = afterString(source, at);
    return { text: source.slice(at + 1, end - 1), end, quoted: true };
  }
  if (quote === '{') {
    let depth = 0;
    let i = at;
    while (i < source.length) {
      const ch = source[i];
      if (ch === '"' || ch === "'" || ch === '`') {
        i = afterString(source, i);
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}' && --depth === 0) {
        i += 1;
        break;
      }
      i += 1;
    }
    return { text: source.slice(at, i), end: i, quoted: false };
  }
  return { text: '', end: at, quoted: false };
}

/** Every string literal written inside `source`. */
function stringLiterals(source) {
  const found = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const end = afterString(source, i);
      found.push(source.slice(i + 1, end - 1));
      i = end;
      continue;
    }
    i += 1;
  }
  return found;
}

/** Every class attribute in a file, as the strings its value is made of. Only
 *  the attribute is read: a `loading` variable, a `progress` translation key and
 *  a `Progress` component name are not classes, and neither is a class built by
 *  a helper the check cannot follow. */
function classStrings(source) {
  const found = [];
  const re = /\b(?:className|class)\s*=/g;
  let match;
  while ((match = re.exec(source))) {
    const at = match.index + match[0].length;
    const value = readClassValue(source, at);
    const strings = value.quoted ? [value.text] : stringLiterals(value.text);
    for (const text of strings) found.push({ at: match.index, text });
    re.lastIndex = Math.max(value.end, at);
  }
  return found;
}

/** Every source file under `dir`, at any depth. */
function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return ['.ts', '.tsx', '.html'].includes(extname(path)) ? [path] : [];
  });
}

/** The one-based line `index` falls on. */
function lineAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

const offenders = [];
for (const file of sources(join('frontend', 'src'))) {
  const text = readFileSync(file, 'utf8');
  for (const { at, text: value } of classStrings(text)) {
    for (const word of value.split(/\s+/)) {
      const token = classWord(word);
      if (isDaisyClass(token))
        offenders.push(`${relative('.', file)}:${lineAt(text, at)}  ${token}`);
    }
  }
}

assert.ok(
  offenders.length === 0,
  `daisyUI class names are back in the source, where they generate no styles:\n  ${offenders.join('\n  ')}`,
);

// A pointer or a keyboard landing may repaint a *background*, and nothing else.
//
// `hover:text-…` puts the foreground back in play, and that is exactly how the
// pointer came to repaint a chosen row and a pressed segment: the colour that
// says "chosen" belongs to a state, a state and a hover weigh the same, and the
// state is written later — so a hover must not be writing a foreground colour
// at all (ADR 0038). Geometry and compositing are not a repaint — `outline-`
// (a card's hovered edge), `opacity-`, `animate-`, `underline` — and are left
// alone; the contrast that keeps a disabled control legible is a state's job.
const FOREGROUND_PREFIXES = [
  'text-',
  'fill-',
  'stroke-',
  'caret-',
  'decoration-',
  'placeholder-',
];

/** A class name split at the `:` that separate its variants from its utility.
 *  The ones inside `[...]` are not separators: `data-[active=true]:hover:bg-x`
 *  splits after the bracket, not inside it. */
function splitClass(name) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < name.length; i += 1) {
    const ch = name[i];
    if (ch === '[') depth += 1;
    else if (ch === ']') depth -= 1;
    else if (ch === ':' && depth === 0) {
      parts.push(name.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(name.slice(start));
  return { variants: parts.slice(0, -1), utility: parts[parts.length - 1] };
}

/** A variant that reacts to the pointer or to the keyboard's landing. The
 *  suffix and prefix forms are Tailwind's own (`group-hover`, `peer-hover/…`),
 *  and they reach the same `:hover` this file's variant does. */
function isPointerVariant(variant) {
  return (
    variant === 'focus' ||
    variant === 'focus-visible' ||
    /(^|-)hover(-|\/|$)/.test(variant)
  );
}

const pointerOffenders = [];
for (const file of sources(join('frontend', 'src'))) {
  const text = readFileSync(file, 'utf8');
  for (const { at, text: value } of classStrings(text)) {
    for (const word of value.split(/\s+/)) {
      const token = classWord(word);
      if (!token) continue;
      const { variants, utility } = splitClass(token);
      if (!variants.some(isPointerVariant)) continue;
      if (FOREGROUND_PREFIXES.some((prefix) => utility.startsWith(prefix)))
        pointerOffenders.push(
          `${relative('.', file)}:${lineAt(text, at)}  ${token}`,
        );
    }
  }
}
assert.ok(
  pointerOffenders.length === 0,
  `a hover or focus state repaints a foreground colour, where it may only repaint a background:\n  ${pointerOffenders.join('\n  ')}\n  See docs/adr/0038-悬停只改背景且选中优先.md`,
);

// The hover variant's exclusions have to sit in `:where()`. Three bare
// `:not()`s each add a point of specificity, which compiles *every* `hover:` to
// (0,5,0) — above every state variant — so a hovered "chosen" row repainted
// over its own fill. The second assertion is the one that matters: it is what
// catches the `:where()` being taken back off (ADR 0038).
const hoverVariant =
  /&:hover:where\(\s*:not\(:disabled\):not\(\[aria-disabled='true'\]\):not\(\[data-disabled\]\)\s*\)/.test(
    style,
  );
assert.ok(
  hoverVariant,
  "the hover variant's exclusions are not wrapped in :where(), so every hover outranks every state — see docs/adr/0038-悬停只改背景且选中优先.md",
);
assert.ok(
  !/&:hover:not\(/.test(style),
  "the hover variant's exclusions are outside a :where(), so every hover outranks every state — see docs/adr/0038-悬停只改背景且选中优先.md",
);

console.log(
  'Design tokens match the two design documents in both themes, daisyUI is gone — from the stylesheet and from the source — and a hover or focus state repaints a background only.',
);
