/**
 * A plugin interface that draws inside a video's own details.
 *
 * The second of the two interface mount points, and the other half of what
 * `hello-page` shows: `app.page` gets a page of the plugin's own in the
 * navigation, and `video.panel` gets a block **inside a page the kernel already
 * has** — the details of one video. A plugin that has something to say about a
 * particular video registers here; one whose subject is the library as a whole
 * registers at `app.page`.
 *
 * What a block is handed is the space the window is showing and the video the
 * panel is about (`VideoPanelParams`), which is the whole of it: a block is told
 * which video it is describing and reaches everything else through the mount
 * points it registered. `key` is the plugin's own name for this block and has to
 * be unique among the blocks registered at this mount point — the same rule as
 * at `app.page`, and the reason it is here rather than left out.
 *
 * `docs/插件挂载点目录.md` is the one place that says what each mount point is
 * handed and what it hands back; this file uses one of the six and nothing else.
 * The two interface ones are the only two a plugin interface can register — the
 * other four belong to the body half, which this plugin does not have.
 */
export default async function videoPanelDemo(baseline, context) {
  const React = await baseline.require('react');

  function Demo({ video }) {
    return React.createElement(
      'p',
      { className: 'video-panel-demo' },
      `This block is drawn by the plugin video-panel-demo, for ${video.path}.`,
    );
  }

  context.draw('video.panel', { key: 'demo', draw: Demo });

  // A block has no status line of its own, so this is the plugin's row on the
  // plugin page — the only place the plugin ever says anything about itself.
  context.status('drawing a panel');
}
