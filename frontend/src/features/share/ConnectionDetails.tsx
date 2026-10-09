import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import type { Address } from '../../shared/api';

/**
 * Everything a user has to type into the television: the address to enter, the
 * user name, and — handed in as children, because they belong under this heading
 * and are a block of their own — the credentials.
 *
 * It is shown whether or not the service is running, and that is the point of
 * it: the password is drawn the first time the interface asks for it, so it can
 * be written down, or typed into a television, before anything is answering, and
 * the block is never an empty heading.
 *
 * It takes the facts it draws and an answer for what a press on copy means,
 * rather than reaching for the sharing state itself. That is what makes it a
 * block: a test mounts it with four values and no provider at all, and what it
 * holds to is the one rule of its own — what an address is spelled as on screen.
 */
export function ConnectionDetails({
  running,
  port,
  addresses,
  username,
  onCopy,
  children,
}: {
  running: boolean;
  /** The port the service took, which is not always the one it asked for. */
  port: number | null;
  addresses: Address[];
  username: string;
  onCopy: (text: string) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  // What goes on the clipboard, and what the row shows: the address the machine
  // is on with the port the service actually took, which is not always the one
  // it asked for. The trailing slash is the protocol's own way of saying this
  // is a collection to browse rather than a file to fetch, and a client that is
  // given the address without it may try to treat the root as one.
  const url = (address: string) => `http://${address}:${port}/`;
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">{t('connectionTitle')}</h2>
      {running ? (
        <>
          <p className="text-sm text-muted-foreground">
            {t('connectionRunning')}
          </p>
          {/* An address is the machine's, so this is the one case where the
              block has nothing to show: every network adapter is down, and
              there is nothing to type. Said in as many words rather than
              left as an empty list. */}
          {addresses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('connectionNoAddress')}
            </p>
          ) : (
            <ul className="space-y-1">
              {addresses.map((address) => (
                <li
                  key={`${address.interface}:${address.address}`}
                  className="flex items-center gap-3"
                >
                  <code className="select-all">{url(address.address)}</code>
                  {/* Beside the address being copied and not in the page's own
                      colour: reading the address is the thing, and this is the
                      shortcut past writing it down. */}
                  <Button
                    variant="ghost"
                    size="sm"
                    // The label of the button is the same on every row; its
                    // accessible name is not, so that a screen reader — and
                    // a test — can tell one row's copy from another's.
                    aria-label={`${t('copyAddress')}: ${url(address.address)}`}
                    onClick={() => onCopy(url(address.address))}
                  >
                    {t('copyAddress')}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {address.interface}
                  </span>
                  {/* The one address on the list that works here and
                      nowhere else. Marked for the same reason it is sorted
                      last: it is the one most likely to be tried by
                      mistake, and the mark is what sets the row apart from
                      the ones that can reach a television. */}
                  {address.loopback && (
                    <Badge variant="warning">{t('addressLoopback')}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t('connectionIdle')}</p>
      )}
      <div className="flex items-center gap-3">
        <span className="w-24 text-sm text-muted-foreground">
          {t('username')}
        </span>
        <code className="select-all">{username}</code>
      </div>
      {children}
    </div>
  );
}
