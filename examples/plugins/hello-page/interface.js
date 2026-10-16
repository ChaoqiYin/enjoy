/**
 * The smallest plugin interface there is, and the template to copy.
 *
 * A plugin is a directory. This file, `plugin.json` beside it, and nothing else
 * required: copy the directory into the application data directory's `plugins/`
 * — on macOS `~/Library/Application Support/<the app's bundle id>/plugins/` —
 * and the kernel finds it on the next start. The directory's own name has to be
 * the `id` in the manifest, because the id is how the kernel finds the plugin
 * again and the filesystem has already decided that.
 *
 * Two things about this file are the contract rather than this plugin's choice:
 *
 * - **It is a module, and its default export is a factory.** The kernel imports
 *   it and calls it once, with a baseline and a registration point. It may be
 *   asynchronous, which is what lets it wait for the baseline.
 * - **It imports nothing.** The file is served as it is, with no build step in
 *   front of it, so there is nothing for a relative specifier to resolve
 *   against and nothing that would turn a class name into CSS. React — and the
 *   only React a plugin may use — comes from the baseline, which is the
 *   kernel's own copy: a plugin that brought a second one would render into a
 *   different React than the window it is drawn in
 *   (docs/adr/0043-插件系统的形态.md §3).
 *
 * What it may register is a closed set of six mount points.
 * `docs/插件挂载点目录.md` is the one place that says what each of them is,
 * what it is handed and what it hands back; this example uses the simplest of
 * them and nothing else.
 *
 * The disposer `draw` hands back is not kept here on purpose: it goes into the
 * host's own collector, which is what takes the page off when the plugin is
 * unloaded. To leak, a plugin has to walk around the API (ADR 0045 §5).
 */
export default async function helloPage(baseline, context) {
  const React = await baseline.require('react');

  /**
   * What the page draws. It is an ordinary component of the kernel's React, so
   * hooks work — this one counts its own clicks, which is the smallest way to
   * show that the component is mounted rather than merely described.
   *
   * The kernel hands it the space the window is showing (`AppPageParams`), and
   * that is the whole of what a page is told: a plugin interface reaches the
   * library through the mount points it registered, not by asking the kernel
   * for anything it likes.
   */
  function HelloPage({ space }) {
    const [count, setCount] = React.useState(0);
    return React.createElement(
      'section',
      { style: { padding: '32px', display: 'grid', gap: '12px' } },
      React.createElement('h1', { style: { fontSize: '20px' } }, 'Hello'),
      React.createElement(
        'p',
        null,
        `This page is drawn by the plugin hello-page, in space ${space.id}.`,
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => setCount(count + 1),
          style: { justifySelf: 'start', padding: '6px 12px' },
        },
        `Clicked ${count} times`,
      ),
    );
  }

  // A page of the plugin's own, in the place the navigation gives it. `key` is
  // the plugin's name for the page and is what the route is built from, so it
  // has to be unique among the pages registered at this mount point; `label` is
  // what the navigation shows, in the plugin's own language.
  context.draw('app.page', { key: 'hello', label: 'Hello', draw: HelloPage });

  // What the plugin page lists against this plugin's row. Optional, and the
  // reason a long-running plugin is worth watching: without it the row says
  // only that the plugin is on.
  context.status('ready');
}
