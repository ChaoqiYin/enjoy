import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FolderPlus } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

afterEach(cleanup);

it('says what is missing and offers the way out of it', () => {
  const onAdd = vi.fn();
  render(
    <EmptyState
      icon={<FolderPlus />}
      title="No videos yet"
      message="Add a local folder to start your video library"
      action={<button onClick={onAdd}>Add folder</button>}
    />,
  );
  expect(screen.getByRole('heading', { name: 'No videos yet' })).toBeTruthy();
  expect(
    screen.getByText('Add a local folder to start your video library'),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Add folder' }));
  expect(onAdd).toHaveBeenCalledOnce();
});

it('draws the shape it was asked for', () => {
  // The two states differ in how loudly they say it, which is a drawing, and
  // the drawing is mirrored where a test can pin it without reading class
  // names — the same contract `Button` keeps (界面迁移的已知坑 §3).
  const { container } = render(
    <EmptyState icon={<FolderPlus />} title="Nothing here" message="Nothing" />,
  );
  expect(
    container
      .querySelector('[data-slot="empty-state"]')
      ?.getAttribute('data-variant'),
  ).toBe('plain');
});

it('writes what the library knows on a first launch', () => {
  // 首启空态 says which formats are supported, which is the one thing a user
  // standing in front of an empty library needs to know before choosing a
  // folder. It is drawn as the hints the caller handed over, in the order it
  // handed them.
  const { container } = render(
    <EmptyState
      variant="hero"
      icon={<FolderPlus />}
      title="No videos yet"
      message="Add a local folder"
      hints={['MP4, MKV, AVI and MOV are supported']}
    />,
  );
  expect(
    container
      .querySelector('[data-slot="empty-state"]')
      ?.getAttribute('data-variant'),
  ).toBe('hero');
  expect(screen.getByText('MP4, MKV, AVI and MOV are supported')).toBeTruthy();
});

it('leaves the hints out when there are none to write', () => {
  const { container } = render(
    <EmptyState icon={<FolderPlus />} title="Nothing here" message="Nothing" />,
  );
  expect(container.querySelector('[data-slot="empty-state-hints"]')).toBeNull();
});

it('hides its icon from a reader, which has the title instead', () => {
  const { container } = render(
    <EmptyState
      variant="hero"
      icon={<FolderPlus />}
      title="No videos yet"
      message="Add a local folder"
    />,
  );
  // The glyph carries no meaning the words beside it do not: a screen reader
  // announcing "folder plus" before "No videos yet" is noise.
  expect(
    container
      .querySelector('[data-slot="empty-state-icon"]')
      ?.getAttribute('aria-hidden'),
  ).toBe('true');
});
