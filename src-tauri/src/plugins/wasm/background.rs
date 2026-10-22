//! The second instance a plugin gets by exporting `run` (spec #96 §4).
//!
//! A plugin that wants to work on its own time says so by exporting `run`, and
//! the kernel answers with a second `Store` and a thread of its own. This file
//! is that thread: build the instance, call `run` once, and end.
//!
//! # Two instances, one plugin
//!
//! The background instance shares no linear memory with the front one — they
//! are two wasm instances, and that is the point: a background loop that
//! scribbles over its heap must not be able to reach the answer the front
//! instance is building. What they *do* share is everything the plugin owns as
//! a plugin: its `data/` directory, its queue in the task table, and the
//! kernel's facilities reached through [`super::imports`]. The queue is the one
//! that matters most — work pushed from the front instance's menu is claimed by
//! this one's `task_wait` — and it is the same [`Queue`] handed to both.
//!
//! # It is bounded, and it is not restarted
//!
//! `run` is one call, and the three mechanisms that bound an ordinary call do
//! not all apply here. It is *not* wrapped in the `call_async` timeout the
//! front's `handle` is: a background loop is meant to wait, and a `task_wait(30s)`
//! cut off at five seconds would be a background that cannot do its job
//! (spec #96 §4). What bounds it instead is the plugin's own instructions —
//! epoch and fuel, re-armed on each host call so that a loop making calls does
//! not spend one budget across all of them — and the timeouts the host calls
//! carry themselves.
//!
//! When `run` returns, the background is over. When it traps or panics, the
//! background is over too: the line goes to the log, the thread ends, and
//! nothing restarts it. The front instance is untouched either way, which is
//! the whole of the promise — a broken background half must not take the
//! plugin's answers down with it.

use std::path::PathBuf;
use std::sync::Arc;

use wasmtime::{Engine, Module, Store};

use super::arm;
use super::imports::{self, Guest};
use super::tasks::Queue;

/// Runs the plugin's background half to completion on its own thread.
///
/// Every failure short of a started instance ends the background with a line
/// rather than propagating: this is a thread whose whole job is to be optional,
/// so there is no caller to hand an error to and no reason to make one up.
pub(super) fn run(
    engine: Engine,
    plugin: &str,
    module: Module,
    data_dir: PathBuf,
    queue: Arc<Queue>,
) {
    let runtime = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => {
            tracing::error!(
                plugin,
                "the plugin's background runtime could not be made: {error}"
            );
            return;
        }
    };
    let mut store = Store::new(&engine, Guest::new_background(plugin, data_dir, queue));
    store.limiter(|guest| &mut guest.limits);
    // The start function runs on instantiation, so the store is armed before
    // it, exactly as the front thread arms before its own instance.
    if let Err(reason) = arm(&mut store) {
        tracing::error!(
            plugin,
            "the plugin's background store could not be armed: {reason}"
        );
        return;
    }
    let linker = match imports::linker(&engine) {
        Ok(linker) => linker,
        Err(reason) => {
            tracing::error!(
                plugin,
                "the plugin's background could not be linked: {reason}"
            );
            return;
        }
    };
    let instance =
        match runtime.block_on(async { linker.instantiate_async(&mut store, &module).await }) {
            Ok(instance) => instance,
            Err(error) => {
                tracing::error!(
                    plugin,
                    "the plugin's background instance could not be made: {error}"
                );
                return;
            }
        };
    // The export the whole thread exists for. A `run` that is a function but not
    // one of no arguments and no result is a module the loader let through, and
    // the only honest answer is a line saying so: a background that silently
    // never ran would look exactly like one that had nothing to do.
    let run = match instance.get_typed_func::<(), ()>(&mut store, "run") {
        Ok(run) => run,
        Err(error) => {
            tracing::error!(
                plugin,
                "the plugin's background `run` cannot be called: {error}"
            );
            return;
        }
    };
    match runtime.block_on(async { run.call_async(&mut store, ()).await }) {
        Ok(()) => tracing::debug!(plugin, "the plugin's background run returned"),
        Err(error) => tracing::error!(plugin, "the plugin's background run failed: {error}"),
    }
}
