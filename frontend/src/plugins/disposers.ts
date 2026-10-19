/**
 * The one place cleanups are handed to.
 *
 * Every registration in the plugin system hands its own cleanup back — the
 * interface's mount point registrations, and the Rust side's mount point
 * registrations, wasm instances and timers, which share this collector
 * (docs/adr/0045-挂载点分两半且是封闭集.md §5). The point of the shape is that
 * **forgetting is not the default**: a registration that has to be undone by
 * something the registrant remembers to write elsewhere is a leak waiting for
 * the day it is not written, and a leak shows up far from its cause. Here, to
 * leak, a caller has to walk around the API.
 */

/** What a registration hands back: how it is taken off again. */
export type Disposer = () => void | Promise<void>;

export interface DisposerCollector {
  add(disposer: Disposer): void;
  /** Runs everything, and resolves once everything has. */
  dispose(): Promise<void>;
}

export function createDisposerCollector(): DisposerCollector {
  const disposers: Disposer[] = [];
  return {
    add(disposer) {
      disposers.push(disposer);
    },
    async dispose() {
      // Newest first, and one at a time. The reverse order is what makes a
      // cleanup able to assume the things registered after it are already gone;
      // waiting for each is what makes that assumption hold for a cleanup that
      // hands back a promise — the plugins are asked to clean up over the same
      // narrow channel they work through, so a cleanup can be asynchronous.
      let failure: unknown;
      for (let index = disposers.length - 1; index >= 0; index -= 1) {
        try {
          await disposers[index]();
        } catch (error) {
          // Kept, not thrown: one cleanup that breaks must not strand the ones
          // still to run, which is the leak this whole module exists to close.
          // The first failure is the one reported, because it is the one whose
          // cause is still visible in the state the rest unwound.
          failure ??= error;
        }
      }
      // Emptied before the throw, so a second `dispose()` is a no-op rather
      // than a second run of cleanups that have already happened.
      disposers.length = 0;
      if (failure !== undefined) throw failure;
    },
  };
}
