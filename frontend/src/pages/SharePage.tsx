import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PageFrame } from '../features/library/PageFrame';
import { useNotices } from '../features/library/useNotices';
import { useVideos } from '../features/library/useVideos';
import { useVideoBoard } from '../features/library/useVideoBoard';
import { VideoGrid } from '../features/library/VideoGrid';
import { hoverRoomStyle } from '../features/library/videoCardBox';
import { ConnectionDetails } from '../features/share/ConnectionDetails';
import { DeviceList } from '../features/share/DeviceList';
import { ListWarnings } from '../features/share/ListWarnings';
import { PasswordDetails } from '../features/share/PasswordDetails';
import { Pagination } from '../features/library/Pagination';
import { useShareContext } from '../features/share/ShareProvider';
import { Button } from '../shared/ui/button';
import { ScrollViewport } from '../shared/ScrollViewport';
import type { AppError } from '../shared/api';

/** A failure this page caused, which has no reference to look up: what went
 * wrong is on screen and the remedy is to try again. */
function clientError(code: string): AppError {
  return { code, params: {}, errorId: 'interface' };
}

/**
 * The 共享服务's page: what is being offered, how a client gets to it, and who has
 * been asking.
 *
 * It places the blocks and owns the two things none of them can: what the
 * 共享清单 is, and what a press on copy means here. The 清单 is the listing this
 * route is a page of — the same query every listing page is read through, asked
 * for the records marked as shared (`only: 'shared'`), so which records are on it
 * is the backend's answer rather than a mark this page filters by hand: a page of
 * records cannot be filtered (a record the filter drops is one of the ones this
 * page never saw) and cannot be counted either. The heading above the cards names
 * the same fact. Everything a block draws is handed to it as a fact, so each of
 * the four is a module of its own with its own test, and this file is read for
 * what sits where.
 */
export function SharePage() {
  const { t, i18n } = useTranslation();
  const share = useShareContext();
  const notices = useNotices();
  // The 共享清单, read the way every page reads the videos: the page of records
  // the backend answered the /share listing with, and how many the list holds.
  // The same records are drawn as cards below, so the list is read once here and
  // handed to both.
  const { videos: collection, index, turnTo } = useVideos();
  const board = useVideoBoard();
  const videos = collection.data?.items ?? [];
  const total = collection.data?.total ?? 0;
  const offline = total === 0;
  const running = share.port !== null;
  // The one thing every block can ask for, and the one thing it is not told: what
  // a copy that did not work is reported as. Two blocks can copy, and neither
  // knows the notices exist — the answer to a failure is this page's, said here
  // once.
  const copy = async (text: string) => {
    if (!navigator.clipboard) {
      notices.setError(clientError('app.clipboard.failed'));
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      notices.showCopyHint();
    } catch {
      notices.setError(clientError('app.clipboard.failed'));
    }
  };
  const copyText = (text: string) => void copy(text);
  return (
    <PageFrame>
      {/* The page's own scroll viewport, and the only thing that clips the
          cards in it: the room the first row's and first column's hover
          feedback needs is carried here, exactly as the library's viewport
          carries it, so the 共享清单's left edge is not sliced flat. */}
      <ScrollViewport className="min-h-0 space-y-4" style={hoverRoomStyle}>
        <h1 className="text-3xl font-bold">{t('sharing')}</h1>
        {/* The port is named here and not only in the addresses below, because
            the port is the fact that can be surprising: 4918 is what the
            service asks for, and what it ends up on is whatever was free. It
            reads at the page's own weight rather than muted for that reason. */}
        <p>
          {running ? t('sharingOn', { port: share.port }) : t('sharingOff')}
        </p>
        {/* One button rather than two, as the favorite is one menu entry: the
            service is either running or it is not, and the label says which
            way this one moves it. Starting is the application's own primary
            action; ending is a close, and takes the secondary variant closes
            take — nothing is being undone or thrown away by stopping. */}
        <Button
          variant={running ? 'secondary' : 'primary'}
          // A service over an empty list is a port a device can connect to and
          // find nothing on, which reads as a service that is broken. The
          // backend would serve it happily; this is the interface saying what
          // has to happen first, and it is said below rather than left to the
          // greyed-out button to explain.
          disabled={share.busy || (!running && offline)}
          onClick={() => void (running ? share.stop() : share.start())}
        >
          {running ? t('stopSharing') : t('startSharing')}
        </Button>
        {/* The list itself, drawn as cards so that what is being offered can be
            seen rather than remembered: the same cards and the same right-click
            menu as every other page (the baseline allows no list view anywhere),
            so 移出共享清单 is one click from here too. It comes before the
            connection details because it answers the question the button above
            raises — what am I about to share. */}
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">{t('shareListTitle')}</h2>
          <ListWarnings
            running={running}
            missingFiles={share.missingFiles}
            listChanged={share.listChanged}
          />
          {offline ? (
            // A port a device can connect to and find nothing on reads as a
            // service that is broken, so the button above will not start over an
            // empty list. The reason is said rather than left to the greyed-out
            // button to explain, and it comes with the way out.
            <p className="text-sm text-muted-foreground">
              {t('shareListEmpty')}{' '}
              {/* The way out of the state above, kept a link because that is
                  what it is — the button's link variant is the one that is a
                  link in everything but its name. */}
              <Button asChild variant="link" size="sm">
                <Link to="/">{t('shareListEmptyAction')}</Link>
              </Button>
            </p>
          ) : (
            <>
              {/* How much is on offer, then the cards, then the way to the rest
                  of the list: the count is the 清单's, not the cards', exactly as
                  on every listing page (`VideoPageContent` says it the same way
                  and for the same reason), and the range under the cards is the
                  page's. */}
              <p className="text-sm text-muted-foreground tabular-nums">
                {t('videoCount', {
                  countText: total.toLocaleString(i18n.language),
                })}
              </p>
              <VideoGrid
                videos={videos}
                scan={board.scan}
                onMenu={board.onMenu}
                busy={board.busy}
                actions={board.actions}
                lastPlayedId={board.lastPlayedId}
              />
              <Pagination index={index} total={total} onPageChange={turnTo} />
            </>
          )}
        </div>
        {/* Everything a user has to type into the television, in one place: the
            address to enter, the user name, and the password — which is handed
            in as this block's own child, because it belongs under this heading
            and is read and tested on its own. */}
        <ConnectionDetails
          running={running}
          port={share.port}
          addresses={share.addresses}
          username={share.username}
          onCopy={copyText}
        >
          <PasswordDetails
            password={share.password}
            busy={share.busy}
            needsRestart={share.needsRestart}
            onCopy={copyText}
            onRegenerate={() => void share.regeneratePassword()}
          />
        </ConnectionDetails>
        {/* Only while the service is running: nobody is a client of a service
            that is not there, and an empty list under a stopped service would
            read as a complaint about something that has not been asked for. */}
        {running && <DeviceList devices={share.devices} />}
      </ScrollViewport>
      {/* The menu a right-click on a card opens, and the drawer a click opens:
          the two things the cards in the list above need a page for. */}
      {board.overlays}
    </PageFrame>
  );
}
