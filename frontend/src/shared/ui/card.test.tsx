import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card';

afterEach(cleanup);

function card() {
  return render(
    <Card>
      <CardHeader>
        <CardTitle>Deep sea</CardTitle>
        <CardDescription>4K · 42 minutes</CardDescription>
      </CardHeader>
      <CardContent>Metadata</CardContent>
      <CardFooter>Actions</CardFooter>
    </Card>,
  );
}

it('shows every part it is given', () => {
  card();
  expect(screen.getByText('Deep sea')).toBeTruthy();
  expect(screen.getByText('4K · 42 minutes')).toBeTruthy();
  expect(screen.getByText('Metadata')).toBeTruthy();
  expect(screen.getByText('Actions')).toBeTruthy();
});

it('keeps each part findable by its own name', () => {
  const { container } = card();
  for (const slot of [
    'card',
    'card-header',
    'card-title',
    'card-description',
    'card-content',
    'card-footer',
  ]) {
    expect(container.querySelector(`[data-slot="${slot}"]`)).toBeTruthy();
  }
});

it('lets a caller override what it rendered', () => {
  const { container } = render(<Card className="p-6">body</Card>);
  expect(container.querySelector('[data-slot="card"]')?.className).toContain(
    'p-6',
  );
});
