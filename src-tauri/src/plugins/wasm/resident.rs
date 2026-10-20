//! The instance, and the three things the host needs from it.
//!
//! Split from [`super`] because a `mod.rs` is where the shape is told, not
//! where a store, a memory and two typed functions are kept; the mechanics of
//! one call live here, and the mechanisms that bound it live beside this file.

use wasmtime::{Instance, Memory, Store, Trap, TypedFunc};

use super::imports::Guest;
use super::{arm, CALL_DEADLINE, EPOCH_TICK};
use crate::plugins::runner::RunnerError;

/// The instance, and the three things this side of it needs.
pub(super) struct Resident {
    store: Store<Guest>,
    memory: Memory,
    /// The guest's own idea of where the host may write: `alloc(size)` answers
    /// with a pointer it will keep valid until `handle` returns. The host never
    /// allocates in the guest's memory itself, which is what keeps the two
    /// allocators from disagreeing about it.
    alloc: TypedFunc<i32, i32>,
    /// `handle(method_ptr, method_len, payload_ptr, payload_len)`, answering
    /// with a pointer and a length packed into one integer — high half the
    /// pointer, low half the length.
    handle: TypedFunc<(i32, i32, i32, i32), i64>,
}

impl Resident {
    pub(super) fn of(mut store: Store<Guest>, instance: &Instance) -> Result<Self, String> {
        let memory = instance
            .get_memory(&mut store, "memory")
            .ok_or_else(|| "the plugin's module exports no memory".to_string())?;
        let alloc = instance
            .get_typed_func::<i32, i32>(&mut store, "alloc")
            .map_err(|error| format!("the plugin's module has no usable `alloc`: {error}"))?;
        let handle = instance
            .get_typed_func::<(i32, i32, i32, i32), i64>(&mut store, "handle")
            .map_err(|error| format!("the plugin's module has no usable `handle`: {error}"))?;
        Ok(Self {
            store,
            memory,
            alloc,
            handle,
        })
    }

    /// One call, inside its deadline.
    pub(super) fn answer(
        &mut self,
        runtime: &tokio::runtime::Runtime,
        method: &str,
        payload: &str,
    ) -> Result<String, RunnerError> {
        // What this call is about, for the plugin to read through
        // `video_info`. Set before the limits so that a call cut off by them
        // still leaves the guest knowing what it was asked, rather than the
        // answer to the one before it.
        self.store.data_mut().about_to_call(payload);
        arm(&mut self.store).map_err(RunnerError::Failed)?;
        let deadline = tokio::time::Instant::now() + CALL_DEADLINE + EPOCH_TICK;
        let outcome = runtime.block_on(async {
            tokio::time::timeout_at(deadline, self.call(method, payload)).await
        });
        match outcome {
            Ok(answer) => answer,
            // The third mechanism: the call was cut off while the plugin was
            // inside a host function, where neither epoch nor fuel reaches.
            Err(_) => Err(RunnerError::TimedOut),
        }
    }

    async fn call(&mut self, method: &str, payload: &str) -> Result<String, RunnerError> {
        let size = method.len() + payload.len();
        let at = self
            .alloc
            .call_async(&mut self.store, size as i32)
            .await
            .map_err(|error| self.why(error))?;
        let at = at as usize;
        self.memory
            .write(&mut self.store, at, method.as_bytes())
            .map_err(|error| RunnerError::Failed(error.to_string()))?;
        self.memory
            .write(&mut self.store, at + method.len(), payload.as_bytes())
            .map_err(|error| RunnerError::Failed(error.to_string()))?;
        let packed = self
            .handle
            .call_async(
                &mut self.store,
                (
                    at as i32,
                    method.len() as i32,
                    (at + method.len()) as i32,
                    payload.len() as i32,
                ),
            )
            .await
            .map_err(|error| self.why(error))?;
        let answer_at = (packed >> 32) as u32 as usize;
        // How long the answer is, is the guest's number, and a guest can say
        // anything: the low half of what it returned reaches four gibibytes,
        // and this side would have to allocate that much before the read below
        // could tell it that no such thing is there. What the guest has is its
        // own memory, so that is what the claim is held to — `MEMORY_LIMIT`
        // bounds the instance, and this bounds the allocation made outside it.
        let answer_len =
            ((packed & 0xffff_ffff) as u32 as usize).min(self.memory.data_size(&self.store));
        let mut answer = vec![0u8; answer_len];
        self.memory
            .read(&self.store, answer_at, &mut answer)
            .map_err(|error| RunnerError::Failed(error.to_string()))?;
        String::from_utf8(answer)
            .map_err(|error| RunnerError::Failed(format!("the answer was not text: {error}")))
    }

    /// Why a call did not finish.
    ///
    /// The two traps the limits raise are the call's deadline arriving, not a
    /// fault of the plugin's, and the host reads them the same way it reads the
    /// other two mechanisms: the call said nothing. Everything else is the
    /// plugin's own code failing, and keeps its text for the log.
    fn why(&self, error: wasmtime::Error) -> RunnerError {
        match error.root_cause().downcast_ref::<Trap>() {
            Some(Trap::Interrupt) | Some(Trap::OutOfFuel) => RunnerError::TimedOut,
            _ => RunnerError::Failed(error.to_string()),
        }
    }
}
