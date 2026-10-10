import { cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DirectoryActions } from './DirectoryActions';
import english from '../../../../shared/locales/en/common.json';

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
});

afterEach(cleanup);

function draw(overrides: Partial<Parameters<typeof DirectoryActions>[0]> = {}) {
  const props: Parameters<typeof DirectoryActions>[0] = {
    busy: false,
    onAdd: vi.fn(),
    onRescan: vi.fn(),
    ...overrides,
  };
  return render(
    <I18nextProvider i18n={i18n}>
      <DirectoryActions {...props} />
    </I18nextProvider>,
  );
}

it('names each action with the words it draws', () => {
  draw();
  for (const label of [english.add, english.rescan]) {
    const button = screen.getByRole('button', { name: label });
    expect(button.textContent).toBe(label);
    expect(button.dataset.size).toBe('lg');
    expect(button.dataset.variant).toBe('primary');
  }
});

it('keeps the same names when the words move into a tooltip', () => {
  const { container } = draw({ iconOnly: true, onRegenerate: vi.fn() });
  // The face of the button says nothing now, so the name and the tooltip are
  // the only two places left that say what it does — and the name is the one
  // the routes reach these controls by, which is why it is not the visual form
  // that decides it.
  for (const label of [english.add, english.rescan, english.regenerateAll]) {
    const button = screen.getByRole('button', { name: label });
    expect(button.textContent).toBe('');
    expect(button.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1);
    expect(button.dataset.size).toBe('icon-sm');
    expect(button.dataset.variant).toBe('outline');
    expect(button.closest('[data-slot="tooltip-anchor"]')).toBeTruthy();
  }
  expect(
    container.querySelectorAll('[data-slot="tooltip-anchor"]'),
  ).toHaveLength(3);
});

it('draws no tooltip over an action whose words are already on it', () => {
  const { container } = draw();
  expect(container.querySelector('[data-slot="tooltip-anchor"]')).toBeNull();
});

it('offers no maintenance while one is running, but never blocks adding', () => {
  draw({ busy: true, onRegenerate: vi.fn() });
  // A folder that was just chosen is a folder the running scan has not read
  // yet, and that is the scan's business rather than a reason to refuse the
  // choice.
  expect(
    (screen.getByRole('button', { name: english.add }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  for (const label of [english.rescan, english.regenerateAll]) {
    expect(
      (screen.getByRole('button', { name: label }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  }
});
