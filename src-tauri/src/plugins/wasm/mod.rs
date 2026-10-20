//! The runner that is a real WebAssembly instance.
//!
//! [`Runner`] says what a body owes the host: an answer inside the call's
//! deadline, by whichever of three mechanisms keeps it bounded. This is the
//! implementation that has all three, and it is where each of them lives.
//!
//! # One plugin, one thread, one instance
//!
//! A plugin's body is a thread of its own with a store and an instance that
//! live as long as the plugin is enabled (ADR 0044 §2). Not one instance per
//! call: a plugin is meant to be able to keep state between calls — a parsed
//! index, a cache, progress through a long job — and an instance per call
//! throws all of it away. The price of a resident instance is that it has to be
//! bounded, which is what the three mechanisms below are.
//!
//! The kernel reaches it through a channel and never touches the store: the
//! call goes in, the answer comes out, and one plugin answers one call at a
//! time. The thread ends when the body is dropped and the channel closes.
//!
//! # The three mechanisms, and which stretch each one covers
//!
//! | Where the call is stuck | What stops it |
//! | --- | --- |
//! | the plugin's own loop | epoch and fuel, set on its store |
//! | the runner waiting on its own thread | a bounded receive |
//! | the plugin inside a host function | the timeout around `call_async` |
//!
//! All three end at [`RunnerError::TimedOut`], which is what the host reads as
//! "the call said nothing".
//!
//! The first is [`Store::set_epoch_deadline`] together with a thread that
//! advances the engine's epoch on a timer, plus [`Store::set_fuel`]. Epoch is
//! the one that matters for a plugin's own code, because compiled wasm cannot
//! dodge the check; fuel is the backstop for an epoch ticker that has stopped
//! arriving, and it is spent by work rather than by time.
//!
//! The second is the `recv_timeout` in [`WasmBody::handle`]. It exists because
//! the first and the third both run *on the plugin's thread*: a thread that is
//! wedged somewhere neither of them reaches — inside a synchronous host
//! function, say — must not become a caller that never returns.
//!
//! The third is the [`tokio::time::timeout`] around `Func::call_async`. It is
//! the only one of the three that can end a plugin blocked in a host call, and
//! it is the reason the host functions are async at all (ADR 0044 §5).
//!
//! None of the three is a thread per call: the plugin's thread already exists,
//! and what is bounded is the waiting, not the waiting's shape.
//!
//! # Blind spots this implementation inherits
//!
//! ADR 0044 §6 records what the design accepts, and they are worth repeating
//! where someone reading this code will meet them:
//!
//! - **Epoch and fuel do nothing to wasm blocked inside a host call.** The
//!   limits act on the plugin's own instructions, and a plugin waiting for the
//!   kernel to return is not executing any. That stretch is covered by the
//!   third mechanism above, and by nothing else.
//! - **A bulk memory operation checks the epoch once, at its start.** One
//!   enormous `memory.copy` can therefore run past the deadline by however long
//!   the copy takes.
//! - **This does not work with the Winch backend.** Cranelift is the compiler
//!   here; Winch has no epoch instrumentation to hang a deadline on.
//! - **Running out of thread stack aborts the process.** It is not a trap that
//!   can be caught, so a host function's stack budget has to be sized for the
//!   input a plugin can hand it, not for the kernel's own call depth.
//!
//! Two more that follow from the shape rather than from the limits:
//!
//! - **A plugin wedged where the third mechanism cannot reach it keeps its
//!   thread.** The timeout around `call_async` needs the runtime to be running
//!   to fire, and a host function that blocks the thread outright — a
//!   synchronous read of something that never arrives — stops it being run.
//!   The caller is still saved, by the second mechanism, but nothing can end
//!   the thread; what ends the plugin is the host taking it out of the rotation
//!   after five failed calls.
//! - **What a timeout ends is the call, not the instance.** The future
//!   `call_async` returned is dropped while wasm is inside a host function, and
//!   wasmtime leaves the store usable when it is: the next call is answered as
//!   usual. That is why a plugin that timed out once is still in the rotation —
//!   it has failed once, not finished.

mod fetch;
mod imports;
mod memory;
mod resident;
mod storage;
mod tasks;

#[cfg(test)]
mod fixture;
#[cfg(test)]
mod imports_tests;
#[cfg(test)]
mod tasks_tests;
#[cfg(test)]
mod tests;

use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use wasmtime::{Config, Engine, Instance, Memory, Module, Store, Trap, TypedFunc};

use crate::repository::Repository;

use super::runner::{Runner, RunnerError};

use imports::Guest;
use resident::Resident;
use tasks::Queue;

/// How long one call to a plugin may take.
///
/// A number this implementation chose: neither the port's contract nor the ADR
/// names one. It is a compromise between two things that pull apart. The port
/// is synchronous, so this is how long a kernel thread can be held up by a
/// plugin; and a body's `fetch` is a real request to somebody's web server,
/// which does not answer in a blink. Five seconds is short enough that a call
/// the kernel makes while drawing something is not a visible stall, and long
/// enough for a request that is merely slow.
const CALL_DEADLINE: Duration = Duration::from_secs(5);

/// How often the epoch advances.
///
/// The granularity of the deadline above: a call is stopped within one tick of
/// it. Small, because the cost of the thread is one atomic add and the cost of
/// a coarse tick is a call that runs late.
const EPOCH_TICK: Duration = Duration::from_millis(10);

/// How long the plugin's thread is given to report that it is ready.
///
/// The same order as a call: instantiating a module runs its start function,
/// and a start function is plugin code like any other.
const STARTUP_DEADLINE: Duration = CALL_DEADLINE;

/// How much fuel one call is given.
///
/// Chosen so that a tight loop runs out of it before the clock runs out of
/// time: an empty `loop` burns this in about six hundred milliseconds on the
/// machine this was written on, which is well inside [`CALL_DEADLINE`], so a
/// runaway loop is stopped by fuel rather than by the ticker. That is the point
/// of having both — fuel is counted by the work done rather than by a thread
/// that has to keep waking up, and it costs the same on a machine under load.
/// Epoch is the one that catches what fuel cannot price: a plugin making host
/// calls in a loop spends almost no fuel per call and can outlast any budget
/// that is not measured in time.
const FUEL_PER_CALL: u64 = 1_000_000_000;

/// How much memory one plugin's instance may hold.
///
/// The instance is resident for as long as the plugin is enabled (ADR 0044 §2),
/// so this is memory the kernel process carries the whole time. Sixteen
/// mebibytes is far more than a plugin that fetches a cover and answers a
/// question needs, and small enough that a handful of plugins is not a leak.
const MEMORY_LIMIT: usize = 16 * 1024 * 1024;

/// The epoch the stores are stopped against, and the thread that advances it.
///
/// One engine for every plugin rather than one each: the epoch is a property of
/// the engine, so one ticker thread serves every store on it, and a plugin's
/// own thread stays the only one it has (ADR 0044 §2).
fn engine() -> Result<&'static Engine, RunnerError> {
    static ENGINE: OnceLock<Result<Engine, String>> = OnceLock::new();
    match ENGINE.get_or_init(|| {
        let mut config = Config::new();
        config.epoch_interruption(true);
        config.consume_fuel(true);
        let engine = Engine::new(&config).map_err(|error| error.to_string())?;
        advance_the_epoch(engine.clone())?;
        Ok(engine)
    }) {
        Ok(engine) => Ok(engine),
        Err(reason) => Err(RunnerError::Failed(format!(
            "the wasm engine could not be made: {reason}"
        ))),
    }
}

/// Starts the thread that advances the engine's epoch on a timer.
///
/// Without it every store's deadline is reached immediately — the epoch never
/// moves, so `ticks_beyond_current` is never satisfied — which would turn every
/// call into a timeout. That is why a failure to start it is a failure to make
/// the engine rather than something to shrug off.
fn advance_the_epoch(engine: Engine) -> Result<(), String> {
    std::thread::Builder::new()
        .name("enjoy-plugin-epoch".to_string())
        .spawn(move || loop {
            std::thread::sleep(EPOCH_TICK);
            engine.increment_epoch();
        })
        .map(|_| ())
        .map_err(|error| format!("the epoch thread could not be started: {error}"))
}

/// Gives the store its two limits for the stretch of plugin code about to run.
///
/// Both are per stretch rather than once: fuel is spent, and the epoch deadline
/// is relative to the epoch at the moment it is set, so each one has to be put
/// back before every call — and before instantiation, which runs the module's
/// start function.
pub(in crate::plugins::wasm) fn arm(store: &mut Store<Guest>) -> Result<(), String> {
    store
        .set_fuel(FUEL_PER_CALL)
        .map_err(|error| format!("the plugin's store took no fuel: {error}"))?;
    store.set_epoch_deadline(CALL_DEADLINE.as_millis() as u64 / EPOCH_TICK.as_millis() as u64);
    Ok(())
}

/// One plugin's working half: a thread, a store, and an instance that live as
/// long as this does.
pub(crate) struct WasmBody {
    /// The way to the plugin's thread.
    ///
    /// Held across a whole call rather than only across the send, so one plugin
    /// answers one call at a time: a second caller waits for the first to
    /// finish rather than leaving a job in the channel that the plugin's thread
    /// would reach only after the one before it. That wait is bounded by the
    /// call in front of it, which is bounded by [`CALL_DEADLINE`].
    calls: Mutex<Sender<Job>>,
    /// The plugin's queue, kept out here as well as inside the instance so that
    /// [`Runner::stop`] can reach a `task_wait` the thread is blocked in: the
    /// stop has to arrive without a call going through the channel above, which
    /// is exactly the case where the thread is busy.
    queue: Arc<Queue>,
}

/// One call, on its way to the plugin's thread.
struct Job {
    method: String,
    payload: String,
    /// Where the answer goes. Per call rather than one channel for all of them,
    /// so an answer can never be read by the wrong caller — which is what a
    /// caller that gave up would otherwise leave behind.
    answer: Sender<Result<String, RunnerError>>,
}

impl WasmBody {
    /// Compiles a module and starts the thread it will run on.
    ///
    /// The module's bytes come from a plugin's directory (#86 reads them); what
    /// is decided here is only how it runs.
    ///
    /// `plugin` is the plugin's id, and it is here for two reasons: a line the
    /// body logs has to say whose it is, and the queue the body's `task_*`
    /// imports reach is this plugin's own — the identity every one of those
    /// calls is answered in terms of. `data_dir` is the one directory its
    /// `storage` capability can reach, which is the kernel's to choose — a
    /// plugin does not get to say where it lives. `repository` is the library
    /// the plugin's tasks are rows in, shared with every other user of it.
    pub(crate) fn load(
        plugin: &str,
        module: &[u8],
        data_dir: PathBuf,
        repository: Arc<Mutex<Repository>>,
    ) -> Result<Arc<Self>, RunnerError> {
        let engine = engine()?;
        let module = Module::new(engine, module).map_err(|error| {
            RunnerError::Failed(format!(
                "the plugin's module could not be compiled: {error}"
            ))
        })?;
        let queue = Queue::new(plugin, repository);
        let (jobs, work) = mpsc::channel();
        let (ready, started) = mpsc::channel();
        let plugin = plugin.to_string();
        let starting = Arc::clone(&queue);
        std::thread::Builder::new()
            .name("enjoy-plugin-body".to_string())
            .spawn(move || {
                run(
                    engine.clone(),
                    &plugin,
                    module,
                    data_dir,
                    starting,
                    work,
                    ready,
                )
            })
            .map_err(|error| {
                RunnerError::Failed(format!("the plugin's thread could not be started: {error}"))
            })?;
        match started.recv_timeout(STARTUP_DEADLINE) {
            Ok(Ok(())) => Ok(Arc::new(Self {
                calls: Mutex::new(jobs),
                queue,
            })),
            Ok(Err(reason)) => Err(RunnerError::Failed(reason)),
            Err(_) => Err(RunnerError::Failed(
                "the plugin's instance was not ready inside its deadline".to_string(),
            )),
        }
    }
}

impl Runner for WasmBody {
    fn handle(&self, method: &str, payload: &str) -> Result<String, RunnerError> {
        let calls = self
            .calls
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let (answer, answers) = mpsc::channel();
        calls
            .send(Job {
                method: method.to_string(),
                payload: payload.to_string(),
                answer,
            })
            .map_err(|_| RunnerError::Failed("the plugin's thread is gone".to_string()))?;
        // The bound that covers a plugin's thread wedged where the other two
        // mechanisms cannot reach it: a synchronous host function that never
        // returns. The slack past the deadline is what lets the thread report
        // its own timeout first when the thread is alive to report one.
        match answers.recv_timeout(CALL_DEADLINE + 4 * EPOCH_TICK) {
            Ok(answer) => answer,
            Err(RecvTimeoutError::Timeout) => Err(RunnerError::TimedOut),
            Err(RecvTimeoutError::Disconnected) => Err(RunnerError::Failed(
                "the plugin's thread is gone".to_string(),
            )),
        }
    }

    /// Wakes a `task_wait` the plugin's thread is blocked in and tells the loop
    /// it is over, so a plugin that is switched off finishes rather than
    /// waiting out a timeout nobody is counting on any more.
    ///
    /// This does not go through the call channel, and deliberately: the one
    /// moment the host needs to reach the plugin is the moment the plugin is
    /// busy inside a call, which is when that channel is held. What it sets is
    /// read by the waiting call itself, and read again the next time a call
    /// asks — so a stop that lands between two waits is not lost either.
    fn stop(&self) {
        self.queue.stop();
    }
}

/// The plugin's thread: build the instance, then answer calls until the body is
/// dropped and the channel closes.
fn run(
    engine: Engine,
    plugin: &str,
    module: Module,
    data_dir: PathBuf,
    queue: Arc<Queue>,
    work: Receiver<Job>,
    ready: Sender<Result<(), String>>,
) {
    let runtime = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => {
            let _ = ready.send(Err(format!(
                "the plugin's runtime could not be made: {error}"
            )));
            return;
        }
    };
    let mut store = Store::new(&engine, Guest::new(plugin, data_dir, queue));
    store.limiter(|guest| &mut guest.limits);
    // Instantiating runs the module's own start function, so the store has to
    // be armed before it happens and not only before a call: a store that
    // consumes fuel and holds none traps on the first instruction it runs, and
    // one whose epoch deadline has already passed traps there too.
    if let Err(reason) = arm(&mut store) {
        let _ = ready.send(Err(reason));
        return;
    }
    let linker = match imports::linker(&engine) {
        Ok(linker) => linker,
        Err(reason) => {
            let _ = ready.send(Err(reason));
            return;
        }
    };
    let instance =
        match runtime.block_on(async { linker.instantiate_async(&mut store, &module).await }) {
            Ok(instance) => instance,
            Err(error) => {
                let _ = ready.send(Err(format!(
                    "the plugin's instance could not be made: {error}"
                )));
                return;
            }
        };
    let mut resident = match Resident::of(store, &instance) {
        Ok(resident) => resident,
        Err(reason) => {
            let _ = ready.send(Err(reason));
            return;
        }
    };
    if ready.send(Ok(())).is_err() {
        return;
    }
    while let Ok(job) = work.recv() {
        let answer = resident.answer(&runtime, &job.method, &job.payload);
        let _ = job.answer.send(answer);
    }
}
