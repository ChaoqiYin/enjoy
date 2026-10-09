import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Alert, AlertDescription, AlertTitle } from './alert';

afterEach(cleanup);

const variants = [
  'default',
  'info',
  'success',
  'warning',
  'destructive',
] as const;

function alert(variant?: (typeof variants)[number]) {
  return render(
    <Alert variant={variant}>
      <AlertTitle>Scan failed</AlertTitle>
      <AlertDescription>Try again</AlertDescription>
    </Alert>,
  );
}

it('is announced when it arrives', () => {
  alert();
  const notice = screen.getByRole('alert');
  expect(notice.contains(screen.getByText('Scan failed'))).toBe(true);
  expect(notice.contains(screen.getByText('Try again'))).toBe(true);
});

it('is the default variant when nothing says otherwise', () => {
  alert();
  expect(screen.getByRole('alert').getAttribute('data-variant')).toBe(
    'default',
  );
});

it.each(variants)('wears the %s variant it is given', (variant) => {
  alert(variant);
  expect(screen.getByRole('alert').getAttribute('data-variant')).toBe(variant);
});
