//! The two exports the runtime calls, and the two imports it answers with.
//!
//! Everything in this file is wasm-only and is the whole of what a body owes
//! the runtime (docs/adr/0044 §3):
//!
//! - `memory` — the module's own linear memory, which the runtime writes a
//!   call's text into and reads an answer back out of. Rust's wasm target
//!   exports it by itself.
//! - `alloc(size) -> ptr` — hands the runtime a buffer of that many bytes. The
//!   runtime never allocates in a plugin's memory, so this is the only place
//!   those buffers are made.
//! - `handle(method_ptr, method_len, params_ptr, params_len) -> i64` — one
//!   call in, one answer out, the answer's address in the high half of that
//!   integer and its length in the low half.
//!
//! The imports are all under the module name `enjoy` and are five, of which
//! this plugin uses two: `fetch` and `log` (`wasm/imports.rs` has the table).
//! A plugin declares which of the four capabilities it wants, and these are the
//! ones this one declared.

use std::sync::Mutex;

use crate::{CoverFetcher, Host, Response};

// The module a body's imports are defined under, and the two this plugin uses:
// `fetch(url, url_len, out, cap) -> (status << 32) | len`, and
// `log(level, msg, msg_len)` where `2` is info.
#[link(wasm_import_module = "enjoy")]
extern "C" {
    fn fetch(url: i32, url_len: i32, out: i32, cap: i32) -> i64;
    fn log(level: i32, msg: i32, msg_len: i32);
}

/// How much of a page this plugin reads.
///
/// The runtime caps a fetch at eight mebibytes and this is a sixteenth of that:
/// a page is text, and what is read here is the part of it that names a
/// picture. A page longer than this is read as far as this goes and the plugin
/// says so, rather than being taken for a page that named nothing.
const PAGE_LIMIT: usize = 512 * 1024;

/// The buffer the runtime writes a call's method and params into.
///
/// Held across calls rather than made each time, because the address the
/// runtime is given has to still be valid when it writes — and it is the same
/// buffer every time, since one plugin answers one call at a time.
static INPUT: Mutex<Vec<u8>> = Mutex::new(Vec::new());

/// The buffer a call's answer is left in, for the runtime to read back.
static ANSWER: Mutex<Vec<u8>> = Mutex::new(Vec::new());

/// What the plugin remembers between calls: the page the user filled in.
///
/// Here rather than in the plugin's own struct because a call arrives at an
/// exported function, which has nowhere to keep anything. A body is resident
/// for as long as the plugin is enabled (docs/adr/0044 §2), so this survives
/// from the call that delivered the answer to the calls that need it.
static PLUGIN: Mutex<Option<CoverFetcher>> = Mutex::new(None);

/// Hands the runtime a buffer to write one call into.
#[no_mangle]
pub extern "C" fn alloc(size: i32) -> i32 {
    let size = (size.max(0) as usize).max(1);
    let mut input = INPUT.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    input.clear();
    input.resize(size, 0);
    input.as_mut_ptr() as i32
}

/// One call: the method and its params in, the answer out.
///
/// The answer comes back as one integer because wasm has no pair to return: the
/// address in the high thirty-two bits and the length in the low ones, which is
/// what `Resident::call` unpacks on the other side.
#[no_mangle]
pub extern "C" fn handle(method_at: i32, method_len: i32, params_at: i32, params_len: i32) -> i64 {
    let method = text(method_at, method_len);
    let params = text(params_at, params_len);
    let mut plugin = PLUGIN.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let answer = plugin
        .get_or_insert_with(CoverFetcher::new)
        .answer(&method, &params, &mut Kernel);
    let mut buffer = ANSWER.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    buffer.clear();
    buffer.extend_from_slice(answer.as_bytes());
    ((buffer.as_ptr() as u64) << 32 | buffer.len() as u64) as i64
}

/// The kernel, reached through the two imports above.
struct Kernel;

impl Host for Kernel {
    fn get(&mut self, url: &str) -> Option<Response> {
        let mut body = vec![0u8; PAGE_LIMIT];
        // SAFETY: the address is this plugin's own string and the buffer is
        // this plugin's own memory, both of which outlive the call; the runtime
        // writes at most `cap` bytes into the buffer it was handed.
        let packed = unsafe {
            fetch(
                url.as_ptr() as i32,
                url.len() as i32,
                body.as_mut_ptr() as i32,
                body.len() as i32,
            )
        };
        let status = (packed >> 32) as u32 as u16;
        // Zero is not a status a server sent: it is the runtime saying the
        // request did not arrive (`wasm/imports.rs`).
        if status == 0 {
            return None;
        }
        let len = ((packed & 0xffff_ffff) as u32 as usize).min(body.len());
        body.truncate(len);
        Some(Response { status, body })
    }

    fn note(&mut self, line: &str) {
        // SAFETY: the address is this plugin's own string, which outlives the
        // call, and the runtime reads exactly the length it is given.
        unsafe { log(2, line.as_ptr() as i32, line.len() as i32) };
    }
}

/// The text the runtime left in this plugin's own memory.
///
/// The bytes are the runtime's own, written into the buffer `alloc` handed over
/// and valid for exactly as long as this call, which is what makes reading them
/// here safe.
fn text(at: i32, len: i32) -> String {
    let len = len.max(0) as usize;
    // SAFETY: the buffer was made by `alloc` for this call and the runtime
    // wrote `len` bytes into it; nothing here outlives the call.
    let bytes = unsafe { std::slice::from_raw_parts(at as *const u8, len) };
    String::from_utf8_lossy(bytes).into_owned()
}
