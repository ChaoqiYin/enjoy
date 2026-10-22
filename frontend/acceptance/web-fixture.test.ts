// The fixture's own tests, and they are about the fixture rather than about the
// application: what a walkthrough is shown has to be the rule the backend holds,
// or a walkthrough is a reading of the stand-in. Issue #46 was one of those
// readings — 36 videos whose thumbnails were all `null` meant the card branch
// being walked never ran — and the sharing page's two list facts were the next
// candidates: a service's 共享清单 compared against what it read at start, and
// the count of its files that are gone.
//
// Both are answered here by the same shape the backend answers them with — a
// snapshot compared against, and a set of declared-gone files — and both are
// reachable from the page now, which is the part that makes them worth having:
// a line no walkthrough can reach is a line nobody has read on screen.
//
// The listing is the third of them (ADR 0016): a page of records and a count,
// and the count has to be the list's or every walkthrough shows a pager that
// lies about how much there is.
//
// Every question here goes through `libraryApi` / `shareApi` — the address the
// application itself asks from — rather than through `invoke` with the arguments
// spelled out here. That is not a style: the listing command takes its whole
// query as one argument, so a fixture that unwrapped it wrongly answered an
// empty page while these tests, asking in their own spelling, saw a full one.
// The lesson issue #46 taught, learned a second time: what a test asks has to be
// what the walkthrough asks, or it is reading the stand-in.

import { describe, expect, it } from 'vitest';
import { libraryApi, pluginApi, shareApi, taskApi } from '../src/shared/api';
import { acceptance } from './web-fixture';
import { videos } from './records';
import type { VideoQuery } from '../src/shared/api';

/** The listing as a page asks for it: the whole description, and one page. */
const listing = (query: Partial<VideoQuery> = {}) =>
  libraryApi.list({
    spaceId: 1,
    offset: 0,
    limit: 24,
    sort: 'added',
    ...query,
  });

describe('the fixture as a stand-in backend', () => {
  it('offers a service whose two list facts are computed, not asserted', async () => {
    // Nothing running: both facts are zero, which is what the backend answers
    // for a service that is not there.
    const idle = await shareApi.status(1);
    expect(idle.port).toBeNull();
    expect(idle.missingFiles).toBe(0);

    // Video 1 is the one this fixture declares to be gone from disk, and it is
    // the one the space starts with marked as a favorite, so a walkthrough puts
    // it on the 共享清单 by hand.
    await libraryApi.shared(1, '/acceptance/Movies/video-01.mp4', true);
    const running = await shareApi.open(1);
    expect(running.port).toBe(4918);
    // Counted when the service starts, from the list it read — which is where
    // the page's "some files are gone" line comes from, and the reason it is now
    // reachable in a walkthrough at all.
    expect(running.missingFiles).toBe(1);
    expect(running.listChanged).toBe(false);

    // The list moves while the service runs. The backend notices by comparing
    // its snapshot against the list, and so does this.
    await libraryApi.shared(1, '/acceptance/Archive/video-02.mp4', true);
    const after = await shareApi.status(1);
    expect(after.listChanged).toBe(true);

    // Started again, it is reading the list as it stands: back in step.
    const restarted = await shareApi.open(1);
    expect(restarted.listChanged).toBe(false);

    // And a service that has ended knows nothing about a list or a disk.
    const ended = await shareApi.close();
    expect(ended.port).toBeNull();
    expect(ended.missingFiles).toBe(0);
    expect(ended.listChanged).toBe(false);

    // The two marks this test put on the 共享清单 are taken off again: they are
    // the space's, the fixture holds them for the whole run, and a listing
    // reading them afterwards would be reading this test rather than its seed.
    await libraryApi.shared(1, '/acceptance/Movies/video-01.mp4', false);
    await libraryApi.shared(1, '/acceptance/Archive/video-02.mp4', false);
  });

  it('answers the two facts about the password the way the backend does', async () => {
    await shareApi.open(1);
    // The service is behind the password it started with, so nothing is out of
    // date: the page shows no warning and the password on screen is the one a
    // client would need.
    const started = await shareApi.status(1);
    expect(started.needsRestart).toBe(false);

    // Drawn again under a running service: what the user is shown is the new
    // password, and the service still refuses it — which is the warning.
    const drawn = await shareApi.regeneratePassword(1);
    expect(drawn.password).not.toBe(started.password);
    expect(drawn.needsRestart).toBe(true);

    await shareApi.close();
  });

  it('answers a listing in the shape the interface asks for it', async () => {
    // The whole query travels as one argument (`libraryApi.list`), which is the
    // part that was wrong: read from the wrong level it answered the count of a
    // list it had not filtered, and no card at all.
    const first = await listing();
    expect(first.total).toBe(36);
    expect(first.items).toHaveLength(24);
    expect(first.items[0].file_name).toBe('video-36.mp4');
  });

  it('cuts one page out of the list without dropping or repeating a record', async () => {
    const first = await listing();
    // The page after it: what is left, and the same count — the count is the
    // list's, so it does not shrink as the pages are read.
    const second = await listing({ offset: 24 });
    expect(second.total).toBe(36);
    expect(second.items).toHaveLength(12);
    expect(second.items[0].file_name).toBe('video-12.mp4');
    expect(second.items.at(-1)!.file_name).toBe('video-01.mp4');

    // And the two together are the list: every record once, which is what makes
    // one page follow another rather than merely look plausible.
    const seen = [...first.items, ...second.items].map((video) => video.id);
    expect(new Set(seen).size).toBe(36);
  });

  it('finds no cover until the plugin’s own action has been run', async () => {
    // The cover is the action's answer, and both the record and the panel say
    // so: before it, the record carries no cover and the panel has no row to
    // draw — which is the state every record starts in, and the one a fixture
    // that began with a cover would leave unreadable.
    expect(await libraryApi.fields(1, videos[0].path)).toEqual([]);
    const before = await listing({ search: 'video-01' });
    expect(before.items[0].cover_path).toBeNull();

    // Asked the way the menu asks it (`libraryApi.runAction`), because the
    // argument this command is keyed on is the path the interface sends: a
    // fixture that read the record from somewhere else would answer for the
    // wrong video and look exactly like one that answered correctly.
    const written = await libraryApi.runAction(
      1,
      videos[0].path,
      'cover-fetcher',
    );
    expect(written).toEqual([
      {
        key: 'cover',
        value: '/acceptance/covers/1.jpg',
        source_plugin: 'cover-fetcher',
      },
    ]);
    // And the record the card is drawn from carries it now, under the same
    // directory and in the same shape the kernel writes one into — the video's
    // id and the extension the image turned out to be. That is the half a
    // walkthrough reads on the card; the path is what the panel's row names.
    const after = await listing({ search: 'video-01' });
    expect(after.items[0].cover_path).toBe('/acceptance/covers/1.jpg');
    expect(await libraryApi.fields(1, videos[0].path)).toEqual(written);

    // The record beside it is untouched: an action is about one video, and the
    // panel draws no plugin row for the ones nothing has been found for.
    expect(await libraryApi.fields(1, videos[1].path)).toEqual([]);
    expect(
      (await listing({ search: 'video-02' })).items[0].cover_path,
    ).toBeNull();
  });

  it('gives every listing more than one page to read', async () => {
    // 收藏, 最近播放 and 共享 are pages of the same collection asked three more
    // ways (ADR 0016), and a walkthrough that cannot turn a page of one of them
    // cannot see its pager at all. So each holds more than 24.
    for (const only of ['favorite', 'shared', 'played'] as const) {
      const page = await listing({ only });
      expect(page.items, only).toHaveLength(24);
      expect(page.total, only).toBe(30);
      const rest = await listing({ only, offset: 24 });
      expect(rest.items, only).toHaveLength(6);
      expect(rest.total, only).toBe(30);
    }
  });

  it('narrows and orders the list the way the query names', async () => {
    // A narrower question, answered about itself: the count follows the search
    // rather than the library behind it.
    const searched = await listing({ search: 'video-01' });
    expect(searched.total).toBe(1);
    expect(searched.items.map((video) => video.file_name)).toEqual([
      'video-01.mp4',
    ]);

    // One folder by its exact path, and the count that goes with it.
    const folder = await listing({ folder: '/acceptance/Archive', limit: 100 });
    expect(folder.total).toBe(18);
    expect(
      folder.items.every(
        (video) => video.folder_path === '/acceptance/Archive',
      ),
    ).toBe(true);

    // The four orders the toolbar offers, each read in the direction the
    // interface leaves to the backend (ADR 0016) — named here as the record that
    // comes first, so the assertion is the order rather than the rule.
    const firstOf = async (query: Partial<VideoQuery>) =>
      (await listing({ limit: 100, ...query })).items[0].file_name;
    expect(await firstOf({ sort: 'added' })).toBe('video-36.mp4');
    expect(await firstOf({ sort: 'added', direction: 'asc' })).toBe(
      'video-01.mp4',
    );
    expect(await firstOf({ sort: 'name' })).toBe('video-01.mp4');
    expect(await firstOf({ sort: 'size' })).toBe('video-36.mp4');
    // 最近播放 reads the played ones first by what they were played last, and the
    // never-played records after them rather than left out. The first of them is
    // the oldest record and the last of the added order, which is what makes this
    // an assertion about the playing order rather than the library read again.
    expect(await firstOf({ sort: 'played', only: 'played' })).toBe(
      'video-01.mp4',
    );
    // And with no narrowing at all, the six that were never played are after the
    // thirty that were rather than left out: a list that dropped them would be
    // shorter than the count it reports.
    const whole = await listing({ sort: 'played', limit: 100 });
    expect(whole.items).toHaveLength(36);
    expect(whole.items.map((video) => video.play_count)).toEqual([
      ...Array(30).fill(1),
      ...Array(6).fill(0),
    ]);
  });

  it('can be shown a library with no folders, which is the 首启 screen', async () => {
    // The state a folder has not been added in yet. It is a switch rather than
    // data because no amount of the other records reaches it: while a folder
    // holds thirty-six files the 首启 screen is not on any path a walkthrough
    // can take (issue #46, again).
    acceptance.setLibrary('empty');
    expect(await libraryApi.directories(1)).toEqual([]);
    const empty = await listing();
    expect(empty.total).toBe(0);
    expect(empty.items).toEqual([]);

    acceptance.setLibrary('full');
    expect((await listing()).total).toBe(36);
    expect(await libraryApi.directories(1)).toHaveLength(2);
  });

  it('queues a rescan and answers with the task it became', async () => {
    // The three media commands do not run the work: they queue it and answer
    // with the task's id (spec #101). The pass itself is running in the
    // background — which is where the interface's status bar comes from — and
    // it stays open until the walkthrough ends it.
    const task = await libraryApi.rescan(1);
    expect(typeof task).toBe('number');
    expect((await libraryApi.scanStatus()).phase).toBe('processing');

    acceptance.setScan('complete');
    expect((await libraryApi.scanStatus()).phase).toBe('complete');
  });

  it('answers the plugin lifecycle the way the kernel does', async () => {
    // Asked through `pluginApi`, the address the page itself asks from, for the
    // reason the listing above is: a fixture asked in another spelling is a
    // fixture answering a question nobody asks.
    //
    // The five seeded plugins are the states a row can be in — on with an
    // interface (at each of the two interface mount points), on with a body and
    // no interface, switched off, and refused by its own manifest — because a
    // walkthrough of the plugin page that could only reach one of them would be
    // a reading of a fraction of the page.
    //
    // The two halves are the part worth holding here: the cover plugin answers
    // with no entry, which is what makes the window draw it as a row rather
    // than as a plugin that failed to load, and the two example plugins answer
    // with one, which is what makes the window really mount an interface.
    const seeded = await pluginApi.list();
    expect(
      seeded.map((plugin) => [
        plugin.id,
        plugin.enabled,
        plugin.failure === null,
      ]),
    ).toEqual([
      ['cover-fetcher', true, true],
      ['hello-page', true, true],
      ['video-panel-demo', true, true],
      ['watch-log', false, true],
      ['broken-one', true, false],
    ]);
    expect(seeded.map((plugin) => [plugin.entry, plugin.hasBody])).toEqual([
      [null, true],
      ['hello-page/interface.js', false],
      ['video-panel-demo/interface.js', false],
      ['watch-log/index.js', false],
      [null, false],
    ]);

    // A pre-flight reads a source and copies nothing: what it answers is where
    // the plugin would land and what it declares, and the list is what it was.
    const preview = await pluginApi.preview('/downloads/new-one');
    expect(preview.destination).toBe('/acceptance/plugins/new-one');
    expect(preview.plugin.capabilities).toEqual(['fetch']);
    expect(await pluginApi.list()).toHaveLength(5);
    // And the one refusal a pre-flight can hit: an id is what a plugin is found
    // under, and two plugins cannot share one.
    await expect(
      pluginApi.preview('/downloads/watch-log'),
    ).rejects.toMatchObject({ code: 'plugin.install.exists' });

    // Installing adds a row and uninstalling takes it away — the two ends of the
    // one path a plugin reaches the list by, each answering with the whole list
    // as it now stands.
    const added = await pluginApi.install('/downloads/new-one');
    expect(added.map((plugin) => plugin.id)).toEqual([
      'cover-fetcher',
      'hello-page',
      'video-panel-demo',
      'watch-log',
      'broken-one',
      'new-one',
    ]);
    const removed = await pluginApi.uninstall('new-one', false);
    expect(removed.map((plugin) => plugin.id)).toEqual([
      'cover-fetcher',
      'hello-page',
      'video-panel-demo',
      'watch-log',
      'broken-one',
    ]);

    // Switching one off answers with the whole list, and only that one moved.
    const off = await pluginApi.setEnabled('cover-fetcher', false);
    expect(off.map((plugin) => [plugin.id, plugin.enabled])).toEqual([
      ['cover-fetcher', false],
      ['hello-page', true],
      ['video-panel-demo', true],
      ['watch-log', false],
      ['broken-one', true],
    ]);

    // What the uninstall question is asked with: the rows this plugin wrote, and
    // nothing for a plugin that wrote none.
    expect(await pluginApi.contentRows('cover-fetcher')).toBe(128);
    expect(await pluginApi.contentRows('watch-log')).toBe(0);

    // Safe mode: every plugin off, and none of them gone.
    const aside = await pluginApi.safeMode();
    expect(aside.map((plugin) => [plugin.id, plugin.enabled])).toEqual([
      ['cover-fetcher', false],
      ['hello-page', false],
      ['video-panel-demo', false],
      ['watch-log', false],
      ['broken-one', false],
    ]);

    // Put back the one thing this moved: the fixture is the page's, and the page
    // a walkthrough opens is seeded from it.
    await pluginApi.setEnabled('cover-fetcher', true);
  });

  it('says so when the pass it queued is cancelled', async () => {
    await libraryApi.rescan(1);
    await libraryApi.controlScan('cancel');
    // The command answered with a task id and is long gone; what is left of the
    // cancellation is the phase the pass published as it ended.
    expect((await libraryApi.scanStatus()).phase).toBe('cancelled');
  });

  it('lets a task action move the row a walkthrough is watching', async () => {
    const before = await taskApi.list();
    expect(before.find((row) => row.id === 1)?.state).toBe('running');

    await taskApi.action(1, 'pause');
    const paused = await taskApi.list();
    expect(paused.find((row) => row.id === 1)?.state).toBe('paused');

    // A retry clears the error it is answering — the state the page shows
    // after pressing it has to say so, or the press reads as nothing.
    await taskApi.action(2, 'retry');
    const retried = await taskApi.list();
    expect(retried.find((row) => row.id === 2)).toMatchObject({
      state: 'pending',
      last_error: null,
    });

    // An action with no rule behind it is refused with its code, so the
    // notices corner is reachable from a walkthrough too.
    await expect(taskApi.action(1, 'bogus' as never)).rejects.toMatchObject({
      code: 'task.invalid_action',
    });
  });
});
