import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Skeleton } from './skeleton';

afterEach(cleanup);

it('is something to look at rather than something to read', () => {
  const { container } = render(<Skeleton />);
  const skeleton = container.querySelector('[data-slot="skeleton"]');
  expect(skeleton).toBeTruthy();
  expect(skeleton?.getAttribute('aria-hidden')).toBe('true');
});

it('takes the box the caller gives it', () => {
  const { container } = render(<Skeleton className="h-4 w-32" />);
  expect(
    container.querySelector('[data-slot="skeleton"]')?.className,
  ).toContain('w-32');
});
