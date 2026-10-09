import { act, cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { device } from '../../test/fixtures';
import { DeviceList } from './DeviceList';
import english from '../../../../shared/locales/en/common.json';

/**
 * The device list on its own, including the clock it keeps: the ages of the
 * rows are the one thing here that changes without being told anything, and the
 * rule behind them is this block's rather than the page's.
 */
const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function block(devices: Parameters<typeof DeviceList>[0]['devices']) {
  render(
    <I18nextProvider i18n={i18n}>
      <DeviceList devices={devices} />
    </I18nextProvider>,
  );
}

it('lists the devices that have asked for something, and how long ago', () => {
  block([
    // In the order the backend hands them over, most recently heard from first:
    // the block draws the list rather than sorting it, and the sort is the
    // backend's — it is the one that knows when each request arrived.
    device({ address: '192.168.1.31', name: null, lastSeen: Date.now() }),
    device({ lastSeen: Date.now() - 12_000 }),
  ]);
  // The name the client gave, the address it came from, and the moment it was
  // last heard from.
  const rows = screen.getAllByRole('listitem');
  expect(rows).toHaveLength(2);
  expect(rows[0].textContent).toContain('192.168.1.31');
  // A second and not two: the singular is what the backend's own answer of
  // "just now" reads as, and it is the only count that has a form of its own.
  expect(rows[0].textContent).toContain(
    english.activeAgo_one.replace('{{countText}}', '1'),
  );
  expect(rows[1].textContent).toContain('Infuse/7.6.4');
  expect(rows[1].textContent).toContain('192.168.1.24');
  expect(rows[1].textContent).toContain(
    english.activeAgo_other.replace('{{countText}}', '12'),
  );
  // A client that did not name itself is still a row, under the word for not
  // knowing: a blank there would read as a device that failed to arrive.
  expect(rows[0].textContent).toContain(english.unknown);
});

it('says the list is empty when no device has asked', () => {
  block([]);
  // The wording and not just the absence: the list is drawn only while the
  // service is running, so an empty one is a fact about the last minute rather
  // than a section that has not loaded.
  expect(screen.getByText(english.devicesEmpty)).toBeTruthy();
  expect(screen.getByText(english.devicesHelp)).toBeTruthy();
});

it('counts the age up between two readings of the same list', async () => {
  // The backend answers every five seconds, so a row that only moved when an
  // answer arrived would stand still and then jump. What makes it count instead
  // is a clock of this block's own, and the only way to see that is to run it.
  vi.useFakeTimers();
  const quiet = Date.now() - 3000;
  block([device({ lastSeen: quiet })]);
  expect(
    screen.getByText(english.activeAgo_other.replace('{{countText}}', '3')),
  ).toBeTruthy();

  // Two seconds of nobody touching anything and no new answer: the same list,
  // one age older.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(
    screen.getByText(english.activeAgo_other.replace('{{countText}}', '5')),
  ).toBeTruthy();
});

it('never says a device was heard from zero seconds ago', async () => {
  // The moment comes from the backend and the clock it is measured against is
  // this one's. Two clocks that disagree by a hair would otherwise produce a row
  // reading "0 秒前", which looks like one that has stopped counting.
  vi.useFakeTimers();
  // Heard from this very moment, which is a difference of nothing at all.
  block([device({ lastSeen: Date.now() })]);
  expect(
    screen.getByText(english.activeAgo_one.replace('{{countText}}', '1')),
  ).toBeTruthy();
});
