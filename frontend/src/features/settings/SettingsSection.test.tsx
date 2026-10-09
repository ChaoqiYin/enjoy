import { cleanup, render, screen } from '@testing-library/react';
import { Palette } from 'lucide-react';
import { afterEach, expect, it } from 'vitest';
import { SettingsSection } from './SettingsSection';

afterEach(cleanup);

it('names the block and shows what the caller put in it', () => {
  render(
    <SettingsSection icon={Palette} title="General and appearance">
      <p>Controls</p>
    </SettingsSection>,
  );
  // The title is a section under the page's own name, so it is a heading rather
  // than plain text a reader walking the outline would never reach.
  expect(
    screen.getByRole('heading', { level: 2, name: 'General and appearance' }),
  ).toBeTruthy();
  expect(screen.getByText('Controls')).toBeTruthy();
});

it('carries the one line of explanation when it was given one', () => {
  render(
    <SettingsSection
      icon={Palette}
      title="General and appearance"
      description="Where the controls are"
    >
      <p>Controls</p>
    </SettingsSection>,
  );
  expect(screen.getByText('Where the controls are')).toBeTruthy();
});

it('leaves the explanation out when there is none to give', () => {
  render(
    <SettingsSection icon={Palette} title="General and appearance">
      <p>Controls</p>
    </SettingsSection>,
  );
  // The header holds the name and nothing else: an empty explanation would be a
  // line the block could not fill.
  const header = screen.getByRole('heading', { level: 2 }).parentElement;
  expect(header?.textContent).toBe('General and appearance');
});
