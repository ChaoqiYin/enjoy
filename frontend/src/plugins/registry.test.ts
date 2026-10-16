import { expect, it } from 'vitest';
import type { MountPointKey } from './mountPoints';
import { createRegistry, MountPointError } from './registry';
import type { DrawnContributions } from './registry';

// The registry is the interface's one registration point: a plugin interface
// registers here and nowhere else, and the kernel's pages draw through it and
// nowhere else. What it is held to, then, is position, order, the two load-time
// refusals the decision names, and the cleanup that comes back from every one of
// them.

const page = (key: string): DrawnContributions['app.page'] => ({
  key,
  label: key,
  draw: () => null,
});

it('hands a position back in the order the user put the plugins in', () => {
  const registry = createRegistry({
    order: () => ['second-plugin', 'first-plugin'],
  });
  registry.declare('app.page', 'kernel');
  // Registered in the other order, so what comes back is the user's order and
  // not the order they happened to load in.
  registry.draw('app.page', page('from-first'), 'first-plugin');
  registry.draw('app.page', page('from-second'), 'second-plugin');
  expect(
    registry
      .drawsAt('app.page', 'kernel')
      .map(({ contribution }) => contribution.key),
  ).toEqual(['from-second', 'from-first']);
});

it('puts a plugin the order does not name after the ones it does', () => {
  const registry = createRegistry({ order: () => ['named-plugin'] });
  registry.declare('video.panel', 'kernel');
  registry.draw(
    'video.panel',
    { key: 'unknown', draw: () => null },
    'stranger',
  );
  registry.draw(
    'video.panel',
    { key: 'named', draw: () => null },
    'named-plugin',
  );
  expect(
    registry
      .drawsAt('video.panel', 'kernel')
      .map(({ contribution }) => contribution.key),
  ).toEqual(['named', 'unknown']);
});

it('orders the chain at a data mount point the same way', () => {
  const registry = createRegistry({
    order: () => ['second-plugin', 'first-plugin'],
  });
  registry.declare('video.fields', 'kernel');
  registry.answer(
    'video.fields',
    { key: 'first', answer: () => ({ fields: [] }) },
    'first-plugin',
  );
  registry.answer(
    'video.fields',
    { key: 'second', answer: () => ({ fields: [] }) },
    'second-plugin',
  );
  expect(
    registry
      .answersAt('video.fields', 'kernel')
      .map(({ contribution }) => contribution.key),
  ).toEqual(['second', 'first']);
});

it('refuses a registration at a position nobody declared, and names it', () => {
  const registry = createRegistry();
  expect(() =>
    registry.draw('app.page', page('a-page'), 'some-plugin'),
  ).toThrow(MountPointError);
  expect(() =>
    registry.draw('app.page', page('a-page'), 'some-plugin'),
  ).toThrow(/app\.page/);
});

it('refuses a second declaration and names the first declarer', () => {
  const registry = createRegistry();
  registry.declare('video.panel', 'the-first-plugin');
  expect(() => registry.declare('video.panel', 'the-second-plugin')).toThrow(
    /the-first-plugin/,
  );
});

it('refuses a contribution keyed the way another plugin already keyed one, and names it', () => {
  // A key names a place inside a position — the page a route is built from, the
  // block a panel is drawn as — so two of them is the same configuration error
  // as two declarers, and it is refused in the same place.
  const registry = createRegistry();
  registry.declare('video.fields', 'kernel');
  registry.answer(
    'video.fields',
    { key: 'cover', answer: () => ({ fields: [] }) },
    'first-plugin',
  );
  expect(() =>
    registry.answer(
      'video.fields',
      { key: 'cover', answer: () => ({ fields: [] }) },
      'second-plugin',
    ),
  ).toThrow(/first-plugin/);
});

it('hands back who put a contribution there, not only the contribution', () => {
  // What a page needs to say where a field came from, and what the navigation
  // needs to build a route out of a page a plugin registered: the position knows
  // whose it is, and this is the read that says so.
  const registry = createRegistry();
  registry.declare('app.page', 'kernel');
  const contribution = page('a-page');
  registry.draw('app.page', contribution, 'a-plugin');
  expect(registry.drawsAt('app.page', 'kernel')).toEqual([
    { owner: 'a-plugin', contribution },
  ]);
});

it('refuses a key that is not one of the six', () => {
  const registry = createRegistry();
  expect(() =>
    registry.declare('app.whatever' as MountPointKey, 'kernel'),
  ).toThrow(MountPointError);
  expect(() =>
    registry.draw('app.whatever' as never, page('x') as never, 'kernel'),
  ).toThrow(MountPointError);
});

it('refuses a drawn contribution at a position the body owns, and the other way round', () => {
  // The two calls are already told apart by their types — this is the guard
  // under that, for the day the hand-written pairing of call shapes to mount
  // points drifts from the catalog. The casts are what it costs to reach it.
  const registry = createRegistry();
  registry.declare('video.fields', 'kernel');
  registry.declare('app.page', 'kernel');
  expect(() =>
    registry.draw('video.fields' as never, page('x') as never, 'kernel'),
  ).toThrow(MountPointError);
  expect(() =>
    registry.answer(
      'app.page' as never,
      { key: 'x', answer: () => ({}) } as never,
      'kernel',
    ),
  ).toThrow(MountPointError);
});

it('lets only the declaring entry read the position it declared', () => {
  const registry = createRegistry();
  registry.declare('app.page', 'kernel');
  registry.draw('app.page', page('x'), 'some-plugin');
  expect(() => registry.drawsAt('app.page', 'some-plugin')).toThrow(/kernel/);
});

it('takes a position and everything on it off when the declarer goes', () => {
  const registry = createRegistry();
  const undeclare = registry.declare('app.page', 'declaring-plugin');
  registry.draw('app.page', page('on-someone-elses-position'), 'other-plugin');
  expect(registry.drawsAt('app.page', 'declaring-plugin')).toHaveLength(1);
  undeclare();
  // The position is gone, so the contribution on it is gone with it: one
  // lifecycle axis rather than a rule per pairing of declarer and contributor.
  expect(() => registry.drawsAt('app.page', 'declaring-plugin')).toThrow(
    MountPointError,
  );
  registry.declare('app.page', 'a-later-declarer');
  expect(registry.drawsAt('app.page', 'a-later-declarer')).toEqual([]);
});

it('hands back a disposer that takes one contribution off, and only that one', () => {
  const registry = createRegistry();
  registry.declare('app.page', 'kernel');
  const off = registry.draw('app.page', page('first'), 'a-plugin');
  registry.draw('app.page', page('second'), 'b-plugin');
  off();
  expect(
    registry
      .drawsAt('app.page', 'kernel')
      .map(({ contribution }) => contribution.key),
  ).toEqual(['second']);
});

it('takes every registration off when the registry is disposed', async () => {
  const registry = createRegistry();
  registry.declare('app.page', 'kernel');
  registry.draw('app.page', page('first'), 'a-plugin');
  registry.declare('video.panel', 'kernel');
  registry.draw('video.panel', { key: 'second', draw: () => null }, 'b-plugin');
  await registry.dispose();
  expect(() => registry.drawsAt('app.page', 'kernel')).toThrow(MountPointError);
  expect(() => registry.drawsAt('video.panel', 'kernel')).toThrow(
    MountPointError,
  );
});

it('starts with nothing declared', () => {
  // The positions are what the kernel renders; a registry that declared the six
  // for you would make "registered at a position nobody draws" impossible to
  // notice, which is the whole failure this rule exists to catch.
  const registry = createRegistry();
  for (const key of ['app.page', 'video.panel'] as const) {
    expect(() => registry.drawsAt(key, 'kernel')).toThrow(MountPointError);
  }
  expect(() => registry.answersAt('video.fields', 'kernel')).toThrow(
    MountPointError,
  );
});
