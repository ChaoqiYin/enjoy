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

import { invoke } from '@tauri-apps/api/core';
import { describe, expect, it } from 'vitest';
import './web-fixture';

describe('the fixture as a stand-in backend', () => {
  it('offers a service whose two list facts are computed, not asserted', async () => {
    // Nothing running: both facts are zero, which is what the backend answers
    // for a service that is not there.
    const idle = await invoke<{ port: number | null; missingFiles: number }>(
      'share_status',
      { spaceId: 1 },
    );
    expect(idle.port).toBeNull();
    expect(idle.missingFiles).toBe(0);

    // Video 1 is the one this fixture declares to be gone from disk, and it is
    // the one the space starts with marked as a favorite, so a walkthrough puts
    // it on the 共享清单 by hand.
    await invoke('set_shared', {
      spaceId: 1,
      path: '/acceptance/Movies/video-01.mp4',
      shared: true,
    });
    const running = await invoke<{
      port: number | null;
      missingFiles: number;
      listChanged: boolean;
      needsRestart: boolean;
    }>('open_share', { spaceId: 1 });
    expect(running.port).toBe(4918);
    // Counted when the service starts, from the list it read — which is where
    // the page's "some files are gone" line comes from, and the reason it is now
    // reachable in a walkthrough at all.
    expect(running.missingFiles).toBe(1);
    expect(running.listChanged).toBe(false);

    // The list moves while the service runs. The backend notices by comparing
    // its snapshot against the list, and so does this.
    await invoke('set_shared', {
      spaceId: 1,
      path: '/acceptance/Archive/video-02.mp4',
      shared: true,
    });
    const after = await invoke<{ listChanged: boolean }>('share_status', {
      spaceId: 1,
    });
    expect(after.listChanged).toBe(true);

    // Started again, it is reading the list as it stands: back in step.
    const restarted = await invoke<{ listChanged: boolean }>('open_share', {
      spaceId: 1,
    });
    expect(restarted.listChanged).toBe(false);

    // And a service that has ended knows nothing about a list or a disk.
    const ended = await invoke<{
      port: number | null;
      missingFiles: number;
      listChanged: boolean;
    }>('close_share');
    expect(ended.port).toBeNull();
    expect(ended.missingFiles).toBe(0);
    expect(ended.listChanged).toBe(false);
  });

  it('answers the two facts about the password the way the backend does', async () => {
    await invoke('open_share', { spaceId: 1 });
    // The service is behind the password it started with, so nothing is out of
    // date: the page shows no warning and the password on screen is the one a
    // client would need.
    const started = await invoke<{
      needsRestart: boolean;
      password: string;
    }>('share_status', { spaceId: 1 });
    expect(started.needsRestart).toBe(false);

    // Drawn again under a running service: what the user is shown is the new
    // password, and the service still refuses it — which is the warning.
    const drawn = await invoke<{
      needsRestart: boolean;
      password: string;
    }>('regenerate_share_password', { spaceId: 1 });
    expect(drawn.password).not.toBe(started.password);
    expect(drawn.needsRestart).toBe(true);

    await invoke('close_share');
  });

  it('answers one page of the list, and how many the list holds', async () => {
    const list = (query: Record<string, unknown>) =>
      invoke<{ items: { file_name: string }[]; total: number }>('list_videos', {
        spaceId: 1,
        offset: 0,
        limit: 24,
        ...query,
      });

    // The first page of the library, newest first — which is the page a
    // walkthrough opens on, and the order it is read in.
    const first = await list({ sort: 'added' });
    expect(first.total).toBe(36);
    expect(first.items).toHaveLength(24);
    expect(first.items[0].file_name).toBe('video-36.mp4');

    // The page after it: what is left, and the same count — the count is the
    // list's, so it does not shrink as the pages are read.
    const second = await list({ sort: 'added', offset: 24 });
    expect(second.total).toBe(36);
    expect(second.items).toHaveLength(12);
    expect(second.items[0].file_name).toBe('video-12.mp4');

    // A narrower question, answered about itself: the count follows the search
    // rather than the library behind it.
    const searched = await list({ search: 'video-01' });
    expect(searched.total).toBe(1);
    expect(searched.items.map((video) => video.file_name)).toEqual([
      'video-01.mp4',
    ]);

    // And the mark a listing can be narrowed to, read off the space rather than
    // off the record: this fixture declares video 1 to be the space's favorite.
    const favorites = await list({ only: 'favorite' });
    expect(favorites.items.map((video) => video.file_name)).toEqual([
      'video-01.mp4',
    ]);
  });
});
