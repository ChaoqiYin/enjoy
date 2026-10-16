// How the catalog is written out, in the three languages it has to be read in.
//
// `plugin-catalog.mjs` holds what the catalog must say; this module holds how
// that becomes a file. It is split off for two reasons: the two jobs have no
// overlap (nothing here validates, nothing there formats), and the module that
// does both reached the 500-line limit `check-source.mjs` enforces.
//
// Three decisions are made here, and only here:
//
// - comments and identifiers in generated source are English
//   (docs/guides/编码与架构.md), so each shape and enum in the catalog carries a
//   one-line `comment` for the code and a `doc` for the page an author reads;
// - the TypeScript is handed to Prettier rather than formatted here, because
//   `npm run check` runs `prettier --check` over `frontend/src` and a generated
//   file is not exempt from it;
// - a member is named once, in the catalog, and that name is the one on the
//   wire, so a Rust field with a second word in it is renamed back by
//   `rename_all` — which `model.rs` also carries on exactly the shapes that need
//   it, and not on the ones that do not.

const pascal = (key) =>
  key
    .split('.')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');

const variant = (value) =>
  value
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');

const rustType = (type) =>
  type.endsWith('[]')
    ? `Vec<${rustType(type.slice(0, -2))}>`
    : { string: 'String', number: 'i64', boolean: 'bool' }[type] ?? type;

// A member is named once, in the catalog, and that name is the one on the wire
// (`sourcePlugin`). A Rust field cannot be spelled that way, so the second word
// is joined with an underscore and put back by `rename_all` — which `model.rs`
// also carries on exactly the shapes that need it, and not on the ones that do
// not.
const snake = (name) => name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

const needsRename = (members) =>
  members.some((member) => snake(member.name) !== member.name);

const membersOf = (entry, which) => entry[which] ?? [];

/** One line, in the source's language, for a mount point's call in each direction. */
function callSentence(key, suffix, memberCount) {
  const subject =
    suffix === 'Params'
      ? `What the kernel hands the contributions at \`${key}\``
      : `What the contributions at \`${key}\` hand back`;
  return `${subject}${memberCount === 0 ? ': nothing' : ''}.`;
}

// The prose in the catalog is Chinese and belongs to the page a plugin author
// reads; source comments are English (docs/guides/编码与架构.md), so each shape
// and enum carries a one-line `comment` for the generated code and a `doc` for
// the page. Only the code's half is emitted here.
function rustShapes(catalog) {
  const lines = [];
  for (const [name, shape] of Object.entries(catalog.types)) {
    lines.push(`/// ${shape.comment}`);
    lines.push('#[derive(Debug, Clone, Serialize, Deserialize)]');
    if (needsRename(shape.fields)) lines.push('#[serde(rename_all = "camelCase")]');
    lines.push(`pub(crate) struct ${name} {`);
    for (const member of shape.fields) {
      lines.push(`    pub ${snake(member.name)}: ${rustType(member.type)},`);
    }
    lines.push('}');
    lines.push('');
  }
  for (const [name, definition] of Object.entries(catalog.enums)) {
    lines.push(`/// ${definition.comment}`);
    lines.push('#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]');
    lines.push('#[serde(rename_all = "lowercase")]');
    lines.push(`pub(crate) enum ${name} {`);
    for (const value of definition.values) lines.push(`    ${variant(value)},`);
    lines.push('}');
    lines.push('');
  }
  return lines;
}

export function rustSource(catalog) {
  const lines = [
    '//! The mount point contract catalog, generated from',
    '//! `shared/plugins/mount-points.json`. Do not edit by hand: change the',
    '//! catalog and run `npm run generate:plugins`.',
    '//!',
    '//! Why it exists: docs/adr/0045-挂载点分两半且是封闭集.md section 6.',
    '',
    'use serde::{Deserialize, Serialize};',
    '',
    '/// What a plugin contributes at a mount point.',
    '#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]',
    '#[serde(rename_all = "lowercase")]',
    'pub(crate) enum MountCategory {',
  ];
  for (const value of Object.keys(catalog.categories)) lines.push(`    ${variant(value)},`);
  lines.push('}', '');
  lines.push(
    '/// What a plugin adds at a mount point: `List` keeps every contribution,',
    '/// `Chain` asks in plugin order and merges the answers.',
    '#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]',
    '#[serde(rename_all = "lowercase")]',
    'pub(crate) enum MountKind {',
  );
  for (const value of Object.keys(catalog.kinds)) lines.push(`    ${variant(value)},`);
  lines.push('}', '');
  lines.push(
    '/// Which half of a plugin owns a mount point.',
    '#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]',
    '#[serde(rename_all = "lowercase")]',
    'pub(crate) enum MountSide {',
  );
  for (const value of Object.keys(catalog.sides)) lines.push(`    ${variant(value)},`);
  lines.push('}', '');
  lines.push(
    '/// What a contribution is attached to, and therefore which space it follows.',
    '#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]',
    '#[serde(rename_all = "lowercase")]',
    'pub(crate) enum MountScope {',
  );
  for (const value of Object.keys(catalog.scopes)) lines.push(`    ${variant(value)},`);
  lines.push('}', '');
  lines.push(
    '/// How the answers of several plugins become one.',
    '#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]',
    '#[serde(rename_all = "kebab-case")]',
    'pub(crate) enum MergeRule {',
  );
  for (const value of Object.keys(catalog.mergeRules)) lines.push(`    ${variant(value)},`);
  lines.push('}', '');

  lines.push(...rustShapes(catalog));

  for (const entry of catalog.mountPoints) {
    const name = pascal(entry.key);
    for (const [suffix, which] of [
      ['Params', 'params'],
      ['Result', 'result'],
    ]) {
      const members = membersOf(entry, which);
      lines.push(`/// ${callSentence(entry.key, suffix, members.length)}`);
      lines.push('#[derive(Debug, Clone, Serialize, Deserialize)]');
      if (needsRename(members)) lines.push('#[serde(rename_all = "camelCase")]');
      lines.push(
        members.length === 0
          ? `pub(crate) struct ${name}${suffix} {}`
          : `pub(crate) struct ${name}${suffix} {`,
      );
      for (const member of members) {
        lines.push(`    pub ${snake(member.name)}: ${rustType(member.type)},`);
      }
      if (members.length > 0) lines.push('}');
      lines.push('');
    }
  }

  lines.push(
    '/// One entry of the catalog.',
    '#[derive(Debug, Clone, Copy)]',
    'pub(crate) struct MountPoint {',
    "    pub key: &'static str,",
    '    pub category: MountCategory,',
    '    pub kind: MountKind,',
    '    pub side: MountSide,',
    '    pub scope: MountScope,',
    '    pub merge: MergeRule,',
    '}',
    '',
    '/// The six mount points, in catalog order.',
    `pub(crate) const MOUNT_POINTS: [MountPoint; ${catalog.mountPoints.length}] = [`,
  );
  for (const entry of catalog.mountPoints) {
    lines.push(
      '    MountPoint {',
      `        key: "${entry.key}",`,
      `        category: MountCategory::${variant(entry.category)},`,
      `        kind: MountKind::${variant(entry.kind)},`,
      `        side: MountSide::${variant(entry.side)},`,
      `        scope: MountScope::${variant(entry.scope)},`,
      `        merge: MergeRule::${variant(entry.merge)},`,
      '    },',
    );
  }
  lines.push('];', '');
  return lines.join('\n');
}

/** The same shapes as TypeScript, with a params and result type per mount point. */
export function typescriptSource(catalog) {
  const lines = [
    '// Generated from shared/plugins/mount-points.json — do not edit by hand.',
    '// Change the catalog and run `npm run generate:plugins`.',
    '//',
    '// Why the catalog exists: docs/adr/0045-挂载点分两半且是封闭集.md §6.',
    '',
    '/** What a plugin contributes at a mount point. */',
    `export type MountCategory = ${Object.keys(catalog.categories).map((value) => `'${value}'`).join(' | ')};`,
    '',
    '/** What a plugin adds at a mount point. */',
    `export type MountKind = ${Object.keys(catalog.kinds).map((value) => `'${value}'`).join(' | ')};`,
    '',
    '/** Which half of a plugin owns a mount point. */',
    `export type MountSide = ${Object.keys(catalog.sides).map((value) => `'${value}'`).join(' | ')};`,
    '',
    '/** What a contribution is attached to, and so which space it follows. */',
    `export type MountScope = ${Object.keys(catalog.scopes).map((value) => `'${value}'`).join(' | ')};`,
    '',
    '/** How the answers of several plugins become one. */',
    `export type MergeRule = ${Object.keys(catalog.mergeRules).map((value) => `'${value}'`).join(' | ')};`,
    '',
  ];
  for (const [name, shape] of Object.entries(catalog.types)) {
    lines.push(`/** ${shape.comment} */`, `export interface ${name} {`);
    for (const member of shape.fields) {
      lines.push(`  ${member.name}: ${member.type};`);
    }
    lines.push('}', '');
  }
  for (const [name, definition] of Object.entries(catalog.enums)) {
    lines.push(
      `/** ${definition.comment} */`,
      `export type ${name} = ${definition.values.map((value) => `'${value}'`).join(' | ')};`,
      '',
    );
  }
  for (const entry of catalog.mountPoints) {
    const name = pascal(entry.key);
    for (const [suffix, which] of [
      ['Params', 'params'],
      ['Result', 'result'],
    ]) {
      const members = membersOf(entry, which);
      lines.push(`/** ${callSentence(entry.key, suffix, members.length)} */`);
      lines.push(`export interface ${name}${suffix} {`);
      for (const member of members) lines.push(`  ${member.name}: ${member.type};`);
      lines.push('}', '');
    }
  }
  lines.push(
    '/** One entry of the catalog, as the registry reads it. */',
    'export interface MountPoint {',
    '  readonly key: MountPointKey;',
    '  readonly category: MountCategory;',
    '  readonly kind: MountKind;',
    '  readonly side: MountSide;',
    '  readonly scope: MountScope;',
    '  readonly merge: MergeRule;',
    '}',
    '',
    '/** The keys of the closed set. */',
    `export type MountPointKey = ${catalog.mountPoints.map((entry) => `'${entry.key}'`).join(' | ')};`,
    '',
    '/** The six mount points, in catalog order. */',
    'export const MOUNT_POINTS: readonly MountPoint[] = [',
  );
  for (const entry of catalog.mountPoints) {
    lines.push(
      `  { key: '${entry.key}', category: '${entry.category}', kind: '${entry.kind}', side: '${entry.side}', scope: '${entry.scope}', merge: '${entry.merge}' },`,
    );
  }
  lines.push('];', '');
  return lines.join('\n');
}

export function markdownSource(catalog) {
  const cells = (entry) => [
    `\`${entry.key}\``,
    catalog.categories[entry.category],
    `\`${entry.kind}\``,
    catalog.sides[entry.side],
    catalog.scopes[entry.scope],
    catalog.mergeRules[entry.merge],
    entry.occupants.length === 0 ? '无' : entry.occupants.map((id) => `\`${id}\``).join('、'),
  ];
  const lines = [
    '# 插件挂载点目录',
    '',
    '**这份文件是生成的，不要手改。** 事实来源是 `shared/plugins/mount-points.json`，改完跑 `npm run generate:plugins`；`npm run check` 会拦住「改了目录却忘了重新生成」。',
    '',
    `挂载点是**封闭的六处**，插件只能往它们上面加料——不能删、不能改、不能拦。为什么是这六处、以及每一处归哪一半，见 [ADR 0045](adr/0045-挂载点分两半且是封闭集.md)。`,
    '',
    '| 挂载点 | 类别 | 形态 | 归属 | 空间 | 冲突规则 | 占用者 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const entry of catalog.mountPoints) lines.push(`| ${cells(entry).join(' | ')} |`);
  lines.push(
    '',
    `- **类别**：${Object.entries(catalog.categories).map(([value, label]) => `${label}（\`${value}\`）`).join('、')}——插件加的是界面、数据、流程钩子还是一条动作。`,
    '- **形态**：`list` 是每个插件的贡献各自出现，`chain` 是按插件顺序依次问、把答案合并成一份。',
    '- **归属**：这一处归插件的哪一半——`interface` 是插件界面，`body` 是运行体。动作类与流程类必归运行体，否则没有插件界面的插件永远触发不了自己。',
    '- **空间**：这一处挂在哪里，也就决定了它跟着哪个空间走。',
    '- **冲突规则**：`overlay` 是每个插件的贡献都出现，顺序由用户可调的插件顺序决定；`first-non-empty` 是按插件顺序依次问、取第一个非空的结果，因此后一个插件是补位而不是覆盖。',
    '- **参数**：每一处都带本次调用所在的**空间**，链式那一处还带链上已经问到的字段值**及其来源插件**——后一个插件据此补位，不必重复劳动。字段的来源只在参数这一侧出现：结果是插件交回来的数据，来源由内核写库时补上。',
    '- **占用者**：声明并占用这一处的插件 id（声明即认领）。空表示目前无人声明。',
    '',
    '## 每一处',
    '',
  );
  for (const entry of catalog.mountPoints) {
    lines.push(`### \`${entry.key}\``, '', entry.doc, '');
    lines.push(
      `- 类别：${catalog.categories[entry.category]}（\`${entry.category}\`）`,
      `- 形态：\`${entry.kind}\`（${catalog.kinds[entry.kind]}）`,
      `- 归属：${catalog.sides[entry.side]}（\`${entry.side}\`）`,
      `- 空间：${catalog.scopes[entry.scope]}（\`${entry.scope}\`）`,
      `- 冲突规则：\`${entry.merge}\`（${catalog.mergeRules[entry.merge]}）`,
    );
    for (const [label, which] of [
      ['交给插件的参数', 'params'],
      ['插件交回来的结果', 'result'],
    ]) {
      const members = membersOf(entry, which);
      lines.push(
        `- ${label}：${
          members.length === 0
            ? '无'
            : members.map((member) => `\`${member.name}: ${member.type}\``).join('、')
        }`,
      );
    }
    lines.push('');
  }
  lines.push('## 参数形状', '', '这些形状两侧各有一份类型，都由本目录生成。', '');
  for (const [name, shape] of Object.entries(catalog.types)) {
    lines.push(`### \`${name}\``, '', shape.doc, '', '| 成员 | 类型 | 说明 |', '| --- | --- | --- |');
    for (const member of shape.fields) {
      lines.push(`| \`${member.name}\` | \`${member.type}\` | ${member.doc ?? ''} |`);
    }
    lines.push('');
  }
  for (const [name, definition] of Object.entries(catalog.enums)) {
    lines.push(
      `### \`${name}\``,
      '',
      definition.doc,
      '',
      definition.values.map((value) => `\`${value}\``).join('、'),
      '',
    );
  }
  return lines.join('\n');
}
