import { expect, it } from 'vitest';
import { createDisposerCollector } from './disposers';

// Every registration hands its own cleanup to this collector, so the only
// things worth holding it to are the three the decision names: they run newest
// first, a cleanup that hands back a promise is waited for before the next one
// starts, and one that throws does not strand the rest.

it('takes the registrations off newest first', async () => {
  const collector = createDisposerCollector();
  const order: string[] = [];
  collector.add(() => {
    order.push('oldest');
  });
  collector.add(() => {
    order.push('middle');
  });
  collector.add(() => {
    order.push('newest');
  });
  await collector.dispose();
  expect(order).toEqual(['newest', 'middle', 'oldest']);
});

it('waits for a cleanup that hands back a promise', async () => {
  const collector = createDisposerCollector();
  const order: string[] = [];
  let release = () => {};
  collector.add(() => {
    order.push('declared-first');
  });
  collector.add(
    () =>
      new Promise<void>((resolve) => {
        release = () => {
          order.push('declared-second');
          resolve();
        };
      }),
  );
  const done = collector.dispose();
  // The second one has not answered yet, so the first must not have started:
  // an unwaited promise would let it run now and land in the wrong place.
  expect(order).toEqual([]);
  release();
  await done;
  expect(order).toEqual(['declared-second', 'declared-first']);
});

it('runs the rest when one throws, and reports the first failure', async () => {
  const collector = createDisposerCollector();
  const order: string[] = [];
  collector.add(() => {
    order.push('oldest');
  });
  collector.add(() => {
    order.push('middle');
    throw new Error('the middle one broke');
  });
  collector.add(() => {
    order.push('newest');
  });
  await expect(collector.dispose()).rejects.toThrow('the middle one broke');
  expect(order).toEqual(['newest', 'middle', 'oldest']);
});

it('has nothing left to take off the second time', async () => {
  const collector = createDisposerCollector();
  let runs = 0;
  collector.add(() => {
    runs += 1;
  });
  await collector.dispose();
  await collector.dispose();
  expect(runs).toBe(1);
});
