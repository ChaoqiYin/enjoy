import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSetting, LanguageFocusSync } from './LanguageSetting';
import { NavLink, useLocation } from 'react-router';
import { libraryApi } from './api';
import type { Video } from './api';
import { useLibrary } from './useLibrary';
import { Thumbnail } from './Thumbnail';
import { AddDirectories } from './AddDirectories';
import { ErrorNotice } from './ErrorNotice';
import { ScanProgress } from './ScanProgress';
import { directoryScanAction } from './scanDirectories';
import { VideoList } from './VideoList';
import { VideoActions } from './VideoActions';
import { duration, fileSize } from './format';
import { VideoMenu } from './VideoMenu';
import { VideoDetails } from './VideoDetails';
import { RemoveConfirmation } from './RemoveConfirmation';
import type { MenuTarget } from './VideoMenu';
import { useLibraryView, selectVideos } from './libraryView';
import type { SortOrder } from './libraryView';

export function App() {
  const { t, i18n } = useTranslation();
  const library = useLibrary();
  const location = useLocation();
  const {
    search,
    setSearch,
    folder,
    setFolder,
    list,
    setList,
    sorts,
    setSort,
  } = useLibraryView();
  const sort =
    sorts[location.pathname] ??
    (location.pathname === '/history' ? 'played' : 'newest');
  const [showAdd, setShowAdd] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected =
    library.videos.data?.find((video) => video.id === selectedId) ?? null;
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const detailVideo = library.videos.data?.find(
    (video) => video.id === detailsId,
  );
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [remove, setRemove] = useState<Video | null>(null);
  const videos = selectVideos(
    library.videos.data ?? [],
    location.pathname,
    search,
    folder,
    sort,
    i18n.language,
  );
  const status = library.scan.data;
  const scanning =
    status && ['discovering', 'processing', 'paused'].includes(status.phase);
  const play = (video: Video) => library.run(() => libraryApi.play(video.path));
  const favorite = (video: Video) =>
    library.run(() => libraryApi.favorite(video.path, !video.favorite));
  const actions = {
    play,
    favorite,
    reveal: (video: Video) => library.run(() => libraryApi.reveal(video.path)),
    remove: (video: Video) => {
      setDetailsId(null);
      setRemove(video);
    },
    details: (video: Video) => setDetailsId(video.id),
    regenerate: (video: Video) =>
      library.run(() => libraryApi.regenerate(video.path)),
  };
  const refresh = () =>
    library.run(directoryScanAction(library.directories.data ?? []));
  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      <LanguageFocusSync />
      <header className="sticky top-0 z-20 bg-base-100 border-b border-base-300 p-4 flex flex-wrap items-center gap-4">
        <strong className="text-2xl tracking-tight">Enjoy</strong>
        <nav className="flex flex-wrap gap-2" aria-label={t('nav')}>
          {[
            ['/', t('library')],
            ['/favorites', t('favorites')],
            ['/history', t('history')],
            ['/settings', t('settings')],
          ].map(([path, label]) => (
            <NavLink
              key={path}
              to={path}
              end
              className={({ isActive }) =>
                `btn ${isActive ? 'btn-active' : 'btn-ghost'}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        {scanning && (
          <span role="status" className="text-sm tabular-nums">
            {status.phase === 'paused' ? t('paused') : t('scanning')}
            {status.discovered > 0 && (
              <>
                {' '}
                ·{' '}
                {new Intl.NumberFormat(i18n.language, {
                  style: 'percent',
                  maximumFractionDigits: 0,
                }).format(Math.min(1, status.processed / status.discovered))}
              </>
            )}
          </span>
        )}
        <button
          className="btn ml-auto"
          disabled={library.busy}
          onClick={refresh}
        >
          {t('refresh')}
        </button>
        <button className="btn" onClick={() => setShowAdd(true)}>
          {t('add')}
        </button>
      </header>
      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {library.error && (
          <ErrorNotice
            error={library.error}
            onRetry={library.retryError}
            onClose={() => library.setError(null)}
          />
        )}
        {library.completion && (
          <section
            role="status"
            className="rounded-box bg-base-200 p-4 space-y-2"
          >
            <h2>{t('scanComplete')}</h2>
            <p>
              {t('scanChanges', {
                added: library.completion.changes.added.toLocaleString(
                  i18n.language,
                ),
                updated: library.completion.changes.updated.toLocaleString(
                  i18n.language,
                ),
                missing: library.completion.changes.unavailable.toLocaleString(
                  i18n.language,
                ),
              })}
            </p>
            {library.completion.failures > 0 && (
              <p>
                {t('scanFailures', {
                  countText: library.completion.failures.toLocaleString(
                    i18n.language,
                  ),
                })}
              </p>
            )}
            <button className="btn" onClick={library.dismissCompletion}>
              {t('close')}
            </button>
          </section>
        )}
        {scanning && (
          <ScanProgress status={status} onAction={library.controlScan} />
        )}
        {location.pathname === '/settings' ? (
          <section className="space-y-4">
            <h1 className="text-3xl font-bold">{t('settings')}</h1>
            <LanguageSetting />
            <h2 className="text-xl">{t('folders')}</h2>
            {(library.directories.data ?? []).map((path) => (
              <div
                key={path}
                className="flex items-center gap-4 bg-base-200 p-4 rounded-box"
              >
                <span className="break-all flex-1">{path}</span>
                <button
                  className="btn"
                  disabled={library.busy}
                  onClick={() =>
                    library.run(() => libraryApi.removeDirectory(path))
                  }
                >
                  {t('removeFolder')}
                </button>
              </div>
            ))}
            <button className="btn" disabled={library.busy} onClick={refresh}>
              {t('rescan')}
            </button>
            <button
              className="btn"
              disabled={library.busy}
              onClick={() => library.run(() => libraryApi.regenerate(null))}
            >
              {t('regenerateAll')}
            </button>
            <h2 className="text-xl">{t('about')}</h2>
            <p>Enjoy 0.1.0</p>
          </section>
        ) : (
          <>
            <div className="flex flex-wrap gap-3 items-center">
              <h1 className="text-3xl font-bold mr-auto">
                {location.pathname === '/favorites'
                  ? t('favorites')
                  : location.pathname === '/history'
                    ? t('history')
                    : t('library')}
              </h1>
              <label className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
                {t('search')}{' '}
                <input
                  className="border border-base-300 rounded-field p-2 min-w-0 max-w-full"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('searchPlaceholder')}
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
                {t('folder')}{' '}
                <select
                  className="select min-w-0 max-w-full"
                  value={folder}
                  onChange={(event) => setFolder(event.target.value)}
                >
                  <option value="">{t('all')}</option>
                  {[
                    ...new Set(
                      (library.videos.data ?? []).map(
                        (video) => video.folder_path,
                      ),
                    ),
                  ].map((path) => (
                    <option key={path}>{path}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
                {t('sort')}{' '}
                <select
                  className="select min-w-0 max-w-full"
                  value={sort}
                  onChange={(event) =>
                    setSort(location.pathname, event.target.value as SortOrder)
                  }
                >
                  <option value="newest">{t('newest')}</option>
                  <option value="played">{t('history')}</option>
                  <option value="name">{t('filename')}</option>
                </select>
              </label>
              <button className="btn" onClick={() => setList(!list)}>
                {list ? t('grid') : t('list')}
              </button>
            </div>
            <p className="opacity-60">
              {t('videoCount', {
                count: videos.length,
                countText: videos.length.toLocaleString(i18n.language),
              })}
            </p>
            {library.videos.isPending ? (
              <p>{t('loading')}</p>
            ) : videos.length === 0 ? (
              <section className="text-center py-24 space-y-4">
                <h2 className="text-2xl">
                  {search || folder
                    ? t('noMatch')
                    : location.pathname === '/favorites'
                      ? t('emptyFavorites')
                      : location.pathname === '/history'
                        ? t('emptyHistory')
                        : t('empty')}
                </h2>
                <p>
                  {search || folder
                    ? t('noMatchHelp')
                    : location.pathname === '/favorites'
                      ? t('favoritesHelp')
                      : location.pathname === '/history'
                        ? t('historyHelp')
                        : t('welcome')}
                </p>
                {(search || folder) && (
                  <button
                    className="btn"
                    onClick={() => {
                      setSearch('');
                      setFolder('');
                    }}
                  >
                    {t('clear')}
                  </button>
                )}
                <button className="btn" onClick={() => setShowAdd(true)}>
                  {t('addVideos')}
                </button>
              </section>
            ) : list ? (
              <VideoList
                scan={library.scan.data}
                videos={videos}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onMenu={setMenu}
                busy={library.busy}
                actions={actions}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {videos.map((video) => (
                  <article
                    key={video.id}
                    tabIndex={0}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setMenu({ video, x: event.clientX, y: event.clientY });
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === 'ContextMenu' ||
                        (event.shiftKey && event.key === 'F10')
                      ) {
                        event.preventDefault();
                        const rect =
                          event.currentTarget.getBoundingClientRect();
                        setMenu({ video, x: rect.left, y: rect.top });
                      }
                      if (event.key === 'Enter') setSelectedId(video.id);
                    }}
                    className={`card card-border bg-base-200 ${selected?.id === video.id ? 'outline outline-2' : ''}`}
                    onClick={() => setSelectedId(video.id)}
                    onDoubleClick={() => {
                      if (!library.busy && video.available) void play(video);
                    }}
                  >
                    <Thumbnail
                      videoPath={video.path}
                      scan={library.scan.data}
                      path={video.thumbnail_path}
                      name={video.file_name}
                    />
                    <div className="card-body">
                      <h2 className="card-title break-all">
                        <button
                          className="text-left"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDetailsId(video.id);
                          }}
                        >
                          {video.file_name}
                        </button>
                      </h2>
                      <p
                        className="text-sm opacity-60 truncate"
                        title={video.folder_path}
                      >
                        {video.folder_path}
                      </p>
                      <p>
                        {video.width
                          ? `${video.width} × ${video.height}`
                          : t('metadataPending')}{' '}
                        · {fileSize(video.file_size, i18n.language)}
                      </p>
                      {!video.available && (
                        <p className="text-warning">{t('unavailable')}</p>
                      )}
                      <p className="tabular-nums">
                        {duration(video.duration_ms)}
                      </p>
                      <VideoActions
                        video={video}
                        busy={library.busy}
                        actions={actions}
                      />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
        {detailVideo && (
          <VideoDetails
            scan={library.scan.data}
            video={detailVideo}
            busy={library.busy}
            actions={actions}
            onClose={() => setDetailsId(null)}
          />
        )}
        {showAdd && (
          <AddDirectories
            onClose={() => setShowAdd(false)}
            onError={library.setError}
            onScan={(paths) => {
              setShowAdd(false);
              void library.run(directoryScanAction(paths));
            }}
          />
        )}
        {remove && (
          <RemoveConfirmation
            video={remove}
            onCancel={() => setRemove(null)}
            onConfirm={() => {
              void library.run(() => libraryApi.remove(remove.path));
              setRemove(null);
            }}
          />
        )}
        {menu && (
          <VideoMenu
            target={menu}
            busy={library.busy}
            actions={actions}
            onClose={closeMenu}
          />
        )}
      </main>
    </div>
  );
}
