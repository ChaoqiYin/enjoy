import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

afterEach(cleanup);

// A jsdom-only shortcut worth stating: Radix's roving focus moves on a
// `setTimeout(..., 0)`, so anything that asserts where focus landed has to wait
// a macrotask for it. `vi.waitFor` is that wait.

function Settings({
  orientation,
}: {
  orientation?: 'horizontal' | 'vertical';
}) {
  return (
    <Tabs defaultValue="general" orientation={orientation}>
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="folders">Video folders</TabsTrigger>
      </TabsList>
      <TabsContent value="general">General settings</TabsContent>
      <TabsContent value="folders">Folder settings</TabsContent>
    </Tabs>
  );
}

/** Radix picks a tab on pointerdown, as a browser would deliver it before the
 *  click; `fireEvent.click` alone never reaches the handler. */
it('shows the selected panel and swaps it when another tab is chosen', () => {
  render(<Settings />);
  expect(
    screen.getByRole('tab', { name: 'General' }).getAttribute('aria-selected'),
  ).toBe('true');
  expect(screen.getByRole('tabpanel').textContent).toBe('General settings');

  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Video folders' }), {
    button: 0,
  });
  expect(
    screen
      .getByRole('tab', { name: 'Video folders' })
      .getAttribute('aria-selected'),
  ).toBe('true');
  expect(
    screen.getByRole('tab', { name: 'General' }).getAttribute('aria-selected'),
  ).toBe('false');
  expect(screen.getByRole('tabpanel').textContent).toBe('Folder settings');
});

/** The arrow keys walk the strip and the panel follows the focus — Radix's
 *  automatic activation, which is what makes the strip feel like one control. */
it('moves along the strip with the arrow keys', async () => {
  render(<Settings />);
  const general = screen.getByRole('tab', { name: 'General' });
  const folders = screen.getByRole('tab', { name: 'Video folders' });

  general.focus();
  fireEvent.keyDown(general, { key: 'ArrowRight' });
  await vi.waitFor(() => expect(document.activeElement).toBe(folders));
  expect(screen.getByRole('tabpanel').textContent).toBe('Folder settings');
});

it('reads its orientation, and the vertical strip walks on the other axis', async () => {
  render(<Settings orientation="vertical" />);
  expect(screen.getByRole('tablist').getAttribute('aria-orientation')).toBe(
    'vertical',
  );

  const general = screen.getByRole('tab', { name: 'General' });
  const folders = screen.getByRole('tab', { name: 'Video folders' });
  general.focus();
  // The horizontal arrow does nothing once the strip is vertical.
  fireEvent.keyDown(general, { key: 'ArrowRight' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(document.activeElement).toBe(general);

  fireEvent.keyDown(general, { key: 'ArrowDown' });
  await vi.waitFor(() => expect(document.activeElement).toBe(folders));
});
