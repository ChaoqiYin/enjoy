//! Reading and writing the guest's linear memory.
//!
//! Every import that carries text or bytes does it the same way — a pointer and
//! a length into the guest's own memory — so the four moves below are the whole
//! of the translation between a plugin's strings and the host's, and every
//! import in the three files beside this one is written in terms of them.
//!
//! The two directions are not symmetric, and the asymmetry is deliberate:
//! **the host never allocates in the guest's memory**, so every buffer it writes
//! into is one the guest handed over, and a `len` a guest claims is held to what
//! the guest actually has rather than taken at its word (see [`bytes`]). One
//! allocator, one opinion about what is free.

use wasmtime::{Caller, Memory};

use super::imports::Guest;

/// The guest's own memory, as the host reaches it.
fn memory(caller: &mut Caller<'_, Guest>) -> Result<Memory, wasmtime::Error> {
    caller
        .get_export("memory")
        .and_then(|export| export.into_memory())
        .ok_or_else(|| wasmtime::Error::msg("the plugin's module exports no memory"))
}

/// The bytes a guest handed over, held to what the guest has.
///
/// A pointer and a length are the guest's own numbers, and a guest can say
/// anything: `len` reaches four gibibytes, and this side would have to allocate
/// that much before the read below could refuse it. What the guest has is its
/// own memory, so that is what the claim is held to — `MEMORY_LIMIT` bounds the
/// instance, and the `.min` below bounds the allocation made outside it. An
/// oversized claim costs the plugin, not the process it runs in.
pub(super) fn bytes(
    caller: &mut Caller<'_, Guest>,
    at: i32,
    len: i32,
) -> Result<Vec<u8>, wasmtime::Error> {
    let memory = memory(caller)?;
    let len = (len.max(0) as usize).min(memory.data_size(&*caller));
    let mut bytes = vec![0u8; len];
    memory
        .read(&*caller, at.max(0) as usize, &mut bytes)
        .map_err(|error| {
            wasmtime::Error::msg(format!("a plugin's bytes were out of reach: {error}"))
        })?;
    Ok(bytes)
}

/// The same, as text.
pub(super) fn text(
    caller: &mut Caller<'_, Guest>,
    at: i32,
    len: i32,
) -> Result<String, wasmtime::Error> {
    let bytes = bytes(caller, at, len)?;
    String::from_utf8(bytes)
        .map_err(|error| wasmtime::Error::msg(format!("a plugin sent text that was not: {error}")))
}

/// Writes as much of `bytes` as fits in the guest's buffer, and no more.
///
/// The buffer is the guest's: `cap` is how much it allocated, and a host that
/// wrote past it would be writing over whatever the guest keeps next door. What
/// does not fit is not written, and every caller answers with the length the
/// value really has, so a guest that was given less than it asked for can see
/// that it was.
pub(super) fn put(
    caller: &mut Caller<'_, Guest>,
    at: i32,
    cap: i32,
    bytes: &[u8],
) -> Result<(), wasmtime::Error> {
    let memory = memory(caller)?;
    let room = (cap.max(0) as usize).min(bytes.len());
    memory
        .write(&mut *caller, at.max(0) as usize, &bytes[..room])
        .map_err(|error| {
            wasmtime::Error::msg(format!("a plugin's buffer was out of reach: {error}"))
        })
}
