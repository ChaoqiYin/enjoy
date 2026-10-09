import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FolderSelect } from './FolderSelect';

// jsdom answers `element.matches(':modal')` by recursing through nwsapi, which
// costs about 180ms per call; floating-ui asks every ancestor of the panel
// whether it sits in the top layer, so opening one list spends several seconds
// of that. Nothing here is a top-layer element, so answering `false` outright is
// both correct and instant (界面迁移的已知坑 §4).
const matches = Element.prototype.matches;
Element.prototype.matches = function (selector: string) {
  if (selector === ':modal') return false;
  return matches.call(this, selector);
};

// jsdom lays nothing out and implements no scrolling, which is what Radix
// reaches for when it brings the chosen option into view.
Element.prototype.scrollIntoView = vi.fn();

afterEach(cleanup);

const options = [
  { value: '', label: 'All folders' },
  { value: '/movies', label: '/movies' },
  { value: '/shows', label: '/shows' },
];

function folders({
  value = '',
  onValueChange = vi.fn(),
  disabled,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
} = {}) {
  return render(
    <FolderSelect
      value={value}
      options={options}
      onChange={onValueChange}
      disabled={disabled}
      aria-label="Folder"
    />,
  );
}

it('shows the folder the list is narrowed to', () => {
  folders({ value: '/movies' });
  expect(
    screen.getByRole('combobox', { name: 'Folder' }).textContent,
  ).toContain('/movies');
});

it('picks the folder that was pressed', () => {
  const onValueChange = vi.fn();
  folders({ onValueChange });
  fireEvent.click(screen.getByRole('combobox', { name: 'Folder' }));
  fireEvent.click(screen.getByRole('option', { name: '/shows' }));
  expect(onValueChange).toHaveBeenCalledWith('/shows');
});

it('lets the whole library back in when the first option is picked', () => {
  // 「全部目录」 is the absence of a folder filter, which the library holds as no
  // path at all. Radix refuses an item whose value is the empty string, so the
  // two spellings are one thing this component keeps in step — and they are one
  // thing no caller should have to think about, which is why the test is here
  // and not at the toolbar.
  const onValueChange = vi.fn();
  folders({ value: '/movies', onValueChange });
  expect(
    screen.getByRole('combobox', { name: 'Folder' }).textContent,
  ).not.toContain('All folders');
  fireEvent.click(screen.getByRole('combobox', { name: 'Folder' }));
  fireEvent.click(screen.getByRole('option', { name: 'All folders' }));
  expect(onValueChange).toHaveBeenCalledWith('');
});

it('shows the unfiltered label when no folder is chosen', () => {
  folders({ value: '' });
  expect(
    screen.getByRole('combobox', { name: 'Folder' }).textContent,
  ).toContain('All folders');
});

it('cannot be opened while it is disabled', () => {
  const onValueChange = vi.fn();
  folders({ disabled: true, onValueChange });
  const trigger = screen.getByRole('combobox', { name: 'Folder' });
  expect((trigger as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(trigger);
  expect(screen.queryByRole('option')).toBeNull();
});
