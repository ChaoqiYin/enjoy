// First, deliberately: the mocks below are registered above these imports, so
// the doubles have to be in hand by the time a mocked module is first asked
// for. Everything after this line is imported through the modules they stand
// in for.
import * as doubles from '../test/doubles';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { pickDirectory } from '../shared/api';
import { PluginHostProvider } from './PluginHostProvider';
import { PluginSettingsForm } from './PluginSettingsForm';
import type {
  PluginPort,
  PluginSettingField,
  PluginSettingsGroup,
} from './status';
import english from '../../../shared/locales/en/common.json';
import errors from '../../../shared/locales/en/errors.json';

// The platform's picker cannot be opened in a test — there is no platform — so
// the one way a folder is chosen is answered by hand. Everything else about
// `shared/api` is the real thing: what this file is about is the form, not the
// dialog it asks through.
vi.mock('../shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/api')>()),
  pickDirectory: vi.fn(),
}));

/**
 * What the form is held to, which is the whole of what the kernel asks of it:
 * one control per kind, what was typed going to the kernel as the plugin's
 * fields and nothing else, the kernel's answer drawn afterwards, and a refusal
 * drawn **beside the field it is about** rather than at the top of the form.
 */

const i18n = createInstance();

/**
 * jsdom does not implement `ResizeObserver`, and the checkbox measures its own
 * box with one (the house stub, as in `ThemeSetting.test.tsx`).
 */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(async () => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  await i18n.init({
    lng: 'en',
    resources: { en: { translation: english, errors } },
    // The same setting the application's own instance is built with: without it
    // i18next escapes what it interpolates, and a path arrives with its slashes
    // written as entities.
    interpolation: { escapeValue: false },
  });
});

afterEach(cleanup);

function field(
  key: string,
  kind: PluginSettingField['kind'],
  value = '',
  required = false,
): PluginSettingField {
  return { key, kind, label: key, required, value };
}

/** One plugin asking for one of each of the four kinds. */
const ASKED: PluginSettingsGroup = {
  plugin: 'cover-fetcher',
  fields: [
    field('url', 'text', 'https://a.example', true),
    field('notes', 'textarea', 'one per line'),
    field('folder', 'directory', '/covers'),
    field('wanted', 'toggle', 'true'),
  ],
};

function form(group: PluginSettingsGroup, port: PluginPort) {
  const onSaved = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <PluginHostProvider port={port}>
        <PluginSettingsForm group={group} spaceId={7} onSaved={onSaved} />
      </PluginHostProvider>
    </I18nextProvider>,
  );
  return onSaved;
}

/** What is in a field, whichever kind of control it is. */
function valueOf(name: RegExp): string {
  const control = screen.getByLabelText(name) as
    HTMLInputElement | HTMLTextAreaElement;
  return control.value;
}

it('draws one control per kind, with what the user has already filled in', () => {
  form(ASKED, doubles.pluginPort([]));

  expect(valueOf(/^url/)).toBe('https://a.example');
  expect(valueOf(/^notes/)).toBe('one per line');
  expect(valueOf(/^folder/)).toBe('/covers');
  expect(screen.getByLabelText(/^wanted/).getAttribute('data-state')).toBe(
    'checked',
  );
  // A required field says so where the user is looking, rather than as a star
  // whose meaning they have to know.
  expect(screen.getByText(english.pluginSettingsRequired)).toBeTruthy();
});

it('sends the declared fields with what was typed, and draws the answer', async () => {
  const saved: PluginSettingsGroup = {
    plugin: 'cover-fetcher',
    fields: [field('url', 'text', 'https://b.example', true)],
  };
  const saveSettings = vi.fn(async () => [saved]);
  const onSaved = form(
    {
      plugin: 'cover-fetcher',
      fields: [field('url', 'text', 'https://a.example', true)],
    },
    doubles.pluginPort([], { saveSettings }),
  );

  fireEvent.change(screen.getByLabelText(/^url/), {
    target: { value: 'https://b.example' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: english.pluginSettingsSave }),
  );

  await waitFor(() => expect(onSaved).toHaveBeenCalledWith([saved]));
  expect(saveSettings).toHaveBeenCalledWith(7, 'cover-fetcher', [
    { key: 'url', value: 'https://b.example' },
  ]);
  // Drawn from the answer rather than from what was typed: what the kernel kept
  // is the only thing that is true afterwards.
  await waitFor(() => expect(valueOf(/^url/)).toBe('https://b.example'));
});

it('draws a refusal beside the field it is about', async () => {
  const port = doubles.pluginPort([], {
    saveSettings: async () => {
      throw {
        code: 'plugin.settings.required',
        params: { plugin: 'cover-fetcher', field: 'url' },
        errorId: 'one',
      };
    },
  });
  form(ASKED, port);

  fireEvent.click(
    screen.getByRole('button', { name: english.pluginSettingsSave }),
  );

  const message = await screen.findByText(errors['plugin.settings.required']);
  const beside = message.closest('div');
  expect(beside?.contains(screen.getByLabelText(/^url/))).toBe(true);
  expect(
    beside?.contains(screen.getByLabelText(/^notes/)),
    'the reason is about one value, so it is not drawn under the others',
  ).toBe(false);
});

it('draws a refusal that names no field above the button', async () => {
  const port = doubles.pluginPort([], {
    saveSettings: async () => {
      throw {
        code: 'plugin.settings.unavailable',
        params: { plugin: 'cover-fetcher' },
        errorId: 'one',
      };
    },
  });
  form(ASKED, port);

  fireEvent.click(
    screen.getByRole('button', { name: english.pluginSettingsSave }),
  );

  // The plugin's name is interpolated into the sentence, so what is on screen
  // is not the template: the words are looked for, and the name with them.
  const message = await screen.findByText(
    /cover-fetcher is not running, so its settings were not saved/,
  );
  expect(screen.getByRole('alert').contains(message)).toBe(true);
});

it('puts the folder the user picked in the field', async () => {
  vi.mocked(pickDirectory).mockResolvedValue('/picked/covers');
  form(ASKED, doubles.pluginPort([]));

  fireEvent.click(
    screen.getByRole('button', { name: english.pluginSettingsFolder }),
  );

  await waitFor(() => expect(valueOf(/^folder/)).toBe('/picked/covers'));
});
