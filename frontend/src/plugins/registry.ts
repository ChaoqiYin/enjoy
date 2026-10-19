import type { ComponentType } from 'react';
import { createDisposerCollector } from './disposers';
import type { Disposer } from './disposers';
import { MOUNT_POINTS } from './mountPoints';
import type {
  AppPageParams,
  MountPoint,
  MountPointKey,
  PluginSettingsParams,
  PluginSettingsResult,
  ScanCompletedParams,
  ScanCompletedResult,
  VideoActionsParams,
  VideoActionsResult,
  VideoFieldsParams,
  VideoFieldsResult,
  VideoPanelParams,
} from './mountPoints';

/**
 * The interface's one registration point.
 *
 * A plugin interface registers here and nowhere else; the kernel's pages draw
 * through it and nowhere else. That is what makes the six mount points a closed
 * set in practice rather than on paper: there is one place to read what can be
 * contributed, one place that knows the order, and one place a cleanup comes
 * back from.
 *
 * Three decisions shape this file, and they are
 * docs/adr/0045-挂载点分两半且是封闭集.md §4 and §5:
 *
 * - **Declaration is claiming.** A position is one of the six, and it exists
 *   only once an entry has declared it — the entry that draws it. Registering
 *   at a position nobody declared, and declaring one twice, are both
 *   configuration errors, and both are refused **here**, while the plugin
 *   interface is being loaded. Refusing them at draw time instead would turn a
 *   mistake that is the same every run into one that shows up depending on what
 *   the user opened and in what order the plugins happened to load.
 * - **A registration hands back its own cleanup**, which goes into the shared
 *   collector. There is no `onDispose` to remember: to leak, a caller has to
 *   walk around this API.
 * - **One lifecycle axis.** The declarer's cleanup takes the position and
 *   everything registered on it with it, so there is no separate rule for "A
 *   was unloaded while B was still hanging off a position A declared".
 *
 * What a declaration *is* here is the reading this ticket had to settle: the
 * position is the mount point itself, and the declaring entry is the one that
 * draws it. So the kernel declares the positions its pages draw, and a plugin
 * declaring one is claiming a position it will draw itself.
 */

/** Which plugin a contribution, or a declaration, belongs to. */
export type PluginId = string;

/**
 * The entry that draws the kernel's own pages, as far as the registry is
 * concerned. A position the kernel draws is declared under this name, and the
 * kernel's pages read it back under the same one — so 「who drew this」 has an
 * answer even for the positions no plugin touches.
 */
export const KERNEL: PluginId = 'kernel';

export { type Disposer };

/**
 * What an entry contributes at the two mount points the interface draws.
 *
 * The call shapes are the generated ones — `mountPoints.ts`, from
 * `shared/plugins/mount-points.json` — and this is only the pairing of a
 * position with its shape. The two keys are exactly the interface-owned mount
 * points of the catalog, which `draw` checks at run time rather than trusting
 * this file to stay in step with it.
 */
export interface DrawnContributions {
  /** A page of the plugin's own, drawn in the place the navigation gives it. */
  'app.page': {
    /** The plugin's name for the page; the route and the navigation entry are built from it. */
    key: string;
    /** What the navigation calls it. The plugin's own words, in its own language. */
    label: string;
    draw: ComponentType<AppPageParams>;
  };
  /** A block the plugin adds to a video's details panel. */
  'video.panel': {
    key: string;
    draw: ComponentType<VideoPanelParams>;
  };
}

/**
 * What an entry contributes at the mount points the kernel asks rather than
 * draws: the answer is data, and the kernel is what writes it down.
 */
export interface AnsweredContributions {
  'video.fields': {
    key: string;
    answer: (
      params: VideoFieldsParams,
    ) => VideoFieldsResult | Promise<VideoFieldsResult>;
  };
  'plugin.settings': {
    key: string;
    answer: (
      params: PluginSettingsParams,
    ) => PluginSettingsResult | Promise<PluginSettingsResult>;
  };
  'scan.completed': {
    key: string;
    answer: (
      params: ScanCompletedParams,
    ) => ScanCompletedResult | Promise<ScanCompletedResult>;
  };
  'video.actions': {
    key: string;
    answer: (
      params: VideoActionsParams,
    ) => VideoActionsResult | Promise<VideoActionsResult>;
  };
}

export type DrawnKey = keyof DrawnContributions;
export type AnsweredKey = keyof AnsweredContributions;

/**
 * A registration that is a configuration error rather than a failure of the
 * plugin's own work: a position nobody declared, a position declared twice, a
 * key that is not one of the six. Thrown while the interface is loading, so it
 * is the kernel's to report and the plugin is not loaded.
 */
export class MountPointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MountPointError';
  }
}

/**
 * A contribution, and the plugin that put it there.
 *
 * The position knows both, and a page that draws a field needs both: what the
 * plugin answered, and which plugin answered it, because 「这个字段是谁给的」
 * is shown next to the value (`SourcedFieldValue`). It is also how a route is
 * built out of a page a plugin registered, without the contribution having to
 * repeat its own plugin's name.
 */
export interface Placement<C> {
  owner: PluginId;
  contribution: C;
}

export interface PluginRegistry {
  /**
   * Claims a position for the entry that will draw it. Every other entry may
   * register on it from here on; nobody else may declare it.
   */
  declare(mountPoint: MountPointKey, owner: PluginId): Disposer;
  draw<M extends DrawnKey>(
    mountPoint: M,
    contribution: DrawnContributions[M],
    owner: PluginId,
  ): Disposer;
  answer<M extends AnsweredKey>(
    mountPoint: M,
    contribution: AnsweredContributions[M],
    owner: PluginId,
  ): Disposer;
  /** What is on a position, in plugin order. The declaring entry's to read. */
  drawsAt<M extends DrawnKey>(
    mountPoint: M,
    owner: PluginId,
  ): readonly Placement<DrawnContributions[M]>[];
  answersAt<M extends AnsweredKey>(
    mountPoint: M,
    owner: PluginId,
  ): readonly Placement<AnsweredContributions[M]>[];
  /** Takes everything off, newest first. */
  dispose(): Promise<void>;
}

export interface RegistryOptions {
  /**
   * The plugins in the order the user put them. Every position reads in it, and
   * a plugin the order does not name comes after the ones it does, in the order
   * it registered — so an order that has not been set yet (or names a plugin
   * that has since been uninstalled) still has one answer rather than two.
   */
  order?: () => readonly PluginId[];
}

interface Entry {
  owner: PluginId;
  kind: 'drawn' | 'answered';
  sequence: number;
  contribution: unknown;
}

interface Position {
  declarer: PluginId;
  entries: Entry[];
}

function mountPointOf(key: MountPointKey): MountPoint | undefined {
  return MOUNT_POINTS.find((entry) => entry.key === key);
}

export function createRegistry({
  order = () => [],
}: RegistryOptions = {}): PluginRegistry {
  const positions = new Map<MountPointKey, Position>();
  const collector = createDisposerCollector();
  let sequence = 0;

  function positionOf(key: MountPointKey): MountPoint {
    const entry = mountPointOf(key);
    if (entry === undefined) {
      throw new MountPointError(`${key} is not one of the six mount points`);
    }
    return entry;
  }

  function declaredPosition(key: MountPointKey): Position {
    const position = positions.get(key);
    if (position === undefined) {
      throw new MountPointError(`no entry has declared ${key}`);
    }
    return position;
  }

  /** The position, if the caller is the entry that declared it. */
  function declaredBy(key: MountPointKey, owner: PluginId): Position {
    const position = declaredPosition(key);
    if (position.declarer !== owner) {
      throw new MountPointError(
        `${key} is declared by ${position.declarer}, not ${owner}`,
      );
    }
    return position;
  }

  function declare(key: MountPointKey, owner: PluginId): Disposer {
    positionOf(key);
    const existing = positions.get(key);
    if (existing !== undefined) {
      throw new MountPointError(
        `${key} is already declared by ${existing.declarer}`,
      );
    }
    positions.set(key, { declarer: owner, entries: [] });
    const off = () => {
      // Only the declaration this call made: a later declarer of the same key
      // must not be taken off by a disposer from before it.
      if (positions.get(key)?.declarer === owner) positions.delete(key);
    };
    collector.add(off);
    return off;
  }

  function register(
    key: MountPointKey,
    kind: Entry['kind'],
    contribution: { key: string },
    owner: PluginId,
  ): Disposer {
    const entry = positionOf(key);
    // The pairing of call shape to mount point is written down by hand above
    // (`DrawnContributions` / `AnsweredContributions`), so it is checked here
    // against the catalog — the one copy that is generated.
    const drawn = entry.side === 'interface';
    if (drawn !== (kind === 'drawn')) {
      throw new MountPointError(
        `${key} is a ${entry.side} mount point and takes an ${drawn ? 'drawn' : 'answered'} contribution`,
      );
    }
    const position = declaredPosition(key);
    // A key names a place inside a position — the page a route is built from,
    // the block a panel is drawn as — so two plugins keying the same one is the
    // same kind of mistake as two declarers, and it is refused in the same
    // place: while the interface is loading, with the plugin that has it named.
    const clash = position.entries.find(
      (entry) =>
        (entry.contribution as { key: string }).key === contribution.key,
    );
    if (clash !== undefined) {
      throw new MountPointError(
        `${key} already has a contribution keyed ${contribution.key}, from ${clash.owner}`,
      );
    }
    const registered: Entry = { owner, kind, sequence, contribution };
    sequence += 1;
    position.entries.push(registered);
    const off = () => {
      const at = position.entries.indexOf(registered);
      if (at !== -1) position.entries.splice(at, 1);
    };
    collector.add(off);
    return off;
  }

  function read<C>(
    key: MountPointKey,
    kind: Entry['kind'],
    owner: PluginId,
  ): Placement<C>[] {
    const position = declaredBy(key, owner);
    const ranks = new Map(order().map((id, index) => [id, index]));
    return position.entries
      .filter((entry) => entry.kind === kind)
      .sort((left, right) => {
        const leftRank = ranks.get(left.owner) ?? Number.POSITIVE_INFINITY;
        const rightRank = ranks.get(right.owner) ?? Number.POSITIVE_INFINITY;
        // `sort` is stable, so two contributions from plugins the order does
        // not name keep the order they registered in.
        return leftRank === rightRank
          ? left.sequence - right.sequence
          : leftRank - rightRank;
      })
      .map((entry) => ({
        owner: entry.owner,
        contribution: entry.contribution as C,
      }));
  }

  return {
    declare,
    draw(key, contribution, owner) {
      return register(key, 'drawn', contribution, owner);
    },
    answer(key, contribution, owner) {
      return register(key, 'answered', contribution, owner);
    },
    drawsAt(key, owner) {
      return read(key, 'drawn', owner);
    },
    answersAt(key, owner) {
      return read(key, 'answered', owner);
    },
    dispose() {
      return collector.dispose();
    },
  };
}
