import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { address } from '../../test/fixtures';
import { ConnectionDetails } from './ConnectionDetails';
import english from '../../../../shared/locales/en/common.json';

/**
 * The connection block on its own: the facts are handed in, so no sharing state,
 * no library and no window are mounted here. What is verified is what the block
 * does with what it is given — which is the address spelling, the mark on the
 * one that works nowhere else, and what it says when there is nothing to say.
 */
const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
});
afterEach(cleanup);

/** The block, with the child it is always given by the page. */
function block(props: Partial<Parameters<typeof ConnectionDetails>[0]> = {}) {
  const onCopy = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <ConnectionDetails
        running={false}
        port={null}
        addresses={[]}
        username="enjoy"
        onCopy={onCopy}
        {...props}
      >
        <div>credentials</div>
      </ConnectionDetails>
    </I18nextProvider>,
  );
  return { onCopy };
}

it('shows the address the service is really on, and copies it', () => {
  const { onCopy } = block({
    // A port other than the one the service asks for, which is what the
    // interface has to be able to show: the address it offers is the one that
    // works, and 4918 is what was wanted rather than what was taken.
    running: true,
    port: 4919,
    addresses: [address()],
  });
  // The address and the port together, in the spelling a client is given: the
  // trailing slash is how the protocol says this is a collection to browse.
  const url = 'http://192.168.1.5:4919/';
  expect(screen.getByText(url)).toBeTruthy();
  // The interface name is what tells two plausible-looking addresses apart on a
  // machine with a virtual adapter.
  expect(screen.getByText('Wi-Fi')).toBeTruthy();

  const copy = screen.getByRole('button', {
    name: `${english.copyAddress}: ${url}`,
  });
  // Copying is beside the thing being copied, and it is not one of the page's
  // emphatic actions: the address is what the user reads, and this is the
  // shortcut past writing it down.
  expect(copy.getAttribute('data-variant')).toBe('ghost');
  fireEvent.click(copy);
  // What goes on the clipboard is the whole address, not the row's label: a
  // block that copied what it drew would be copying "Copy" to a television.
  expect(onCopy).toHaveBeenCalledWith(url);
});

it('marks the address that cannot reach a television', () => {
  block({
    running: true,
    port: 4918,
    addresses: [
      address(),
      address({
        interface: 'Loopback',
        address: '127.0.0.1',
        loopback: true,
      }),
    ],
  });
  const rows = screen.getAllByRole('listitem');
  // The order is the backend's, and the mark is on the last row: the machine
  // talking to itself, which a user copying down the list would be most likely
  // to take by mistake.
  expect(rows[0].textContent).toContain('192.168.1.5');
  expect(rows[0].textContent).not.toContain(english.addressLoopback);
  expect(rows[1].textContent).toContain('http://127.0.0.1:4918/');
  // The mark is the warning one and it is a mark rather than a fact of the row:
  // the interface name is drawn like the address, and this one is set apart
  // from it, which is what the one row that works here and nowhere else needs.
  const mark = rows[1].querySelector('[data-variant="warning"]');
  expect(mark?.textContent).toBe(english.addressLoopback);
  expect(rows[0].querySelector('[data-variant="warning"]')).toBeNull();
});

it('says what to do instead of showing addresses while nothing is running', () => {
  block({ running: false, addresses: [address()] });
  // Nothing is running, so there is no port to put on an address: the block
  // explains itself rather than listing addresses that lead nowhere.
  expect(screen.getByText(english.connectionIdle)).toBeTruthy();
  expect(screen.queryByText('http://192.168.1.5:4918/')).toBeNull();
  // And the credentials are there anyway, which is the reason the block is
  // drawn at all in this state: a user can set the television up first. The
  // child stands in for them here — this block's own answer is the user name.
  expect(screen.getByText('enjoy')).toBeTruthy();
  expect(screen.getByText('credentials')).toBeTruthy();
});

it('says so when the machine has no address to offer', () => {
  block({ running: true, port: 4918 });
  // Every adapter down: a heading with nothing under it is the one thing this
  // block must not be.
  expect(screen.getByText(english.connectionNoAddress)).toBeTruthy();
});
