//! The two exports the runtime calls, and the imports it answers with.

use std::sync::Mutex;

use crate::{Host, Response, Scraper};

#[link(wasm_import_module = "enjoy")]
extern "C" {
    fn fetch(url: i32, url_len: i32, headers: i32, headers_len: i32, out: i32, cap: i32) -> i64;
    fn log(level: i32, msg: i32, msg_len: i32);
    fn storage_read(name: i32, name_len: i32, out: i32, cap: i32) -> i32;
    fn storage_write(name: i32, name_len: i32, data: i32, len: i32) -> i32;
    fn task_push(
        kind: i32,
        kind_len: i32,
        space_id: i64,
        video_id: i64,
        payload: i32,
        payload_len: i32,
    ) -> i64;
    fn task_wait(timeout_ms: i64, out: i32, cap: i32) -> i32;
    fn task_progress(id: i64, current: i64, total: i64, label: i32, label_len: i32) -> i32;
    fn task_checkpoint(id: i64) -> i32;
    fn task_done(id: i64, fields: i32, fields_len: i32) -> i32;
    fn task_fail(id: i64, message: i32, message_len: i32, retry_at_ms: i64) -> i32;
    fn now_ms() -> i64;
}

const PAGE_LIMIT: usize = 2 * 1024 * 1024;

static INPUT: Mutex<Vec<u8>> = Mutex::new(Vec::new());
static ANSWER: Mutex<Vec<u8>> = Mutex::new(Vec::new());
static PLUGIN: Mutex<Option<Scraper>> = Mutex::new(None);

#[no_mangle]
pub extern "C" fn alloc(size: i32) -> i32 {
    let size = (size.max(0) as usize).max(1);
    let mut input = INPUT.lock().unwrap_or_else(|p| p.into_inner());
    input.clear();
    input.resize(size, 0);
    input.as_mut_ptr() as i32
}

#[no_mangle]
pub extern "C" fn handle(method_at: i32, method_len: i32, params_at: i32, params_len: i32) -> i64 {
    let method = text(method_at, method_len);
    let params = text(params_at, params_len);
    let mut plugin = PLUGIN.lock().unwrap_or_else(|p| p.into_inner());
    let answer = plugin
        .get_or_insert_with(Scraper::new)
        .answer(&method, &params, &mut Kernel);
    let mut buffer = ANSWER.lock().unwrap_or_else(|p| p.into_inner());
    buffer.clear();
    buffer.extend_from_slice(answer.as_bytes());
    ((buffer.as_ptr() as u64) << 32 | buffer.len() as u64) as i64
}

#[no_mangle]
pub extern "C" fn memory() -> *const u8 {
    std::ptr::null()
}

pub struct Kernel;

impl Host for Kernel {
    fn get_with_headers(&mut self, url: &str, headers_json: &str) -> Option<Response> {
        let mut body = vec![0u8; PAGE_LIMIT];
        let h_ptr = headers_json.as_ptr() as i32;
        let h_len = headers_json.len() as i32;
        let packed = unsafe {
            fetch(
                url.as_ptr() as i32,
                url.len() as i32,
                h_ptr,
                h_len,
                body.as_mut_ptr() as i32,
                body.len() as i32,
            )
        };
        let status = (packed >> 32) as u32 as u16;
        if status == 0 {
            return None;
        }
        let len = ((packed & 0xffff_ffff) as u32 as usize).min(body.len());
        body.truncate(len);
        Some(Response { status, body })
    }

    fn log(&mut self, line: &str) {
        unsafe { log(2, line.as_ptr() as i32, line.len() as i32) };
    }

    fn storage_read(&mut self, name: &str) -> Option<Vec<u8>> {
        let mut buf = vec![0u8; PAGE_LIMIT];
        let n = unsafe {
            storage_read(
                name.as_ptr() as i32,
                name.len() as i32,
                buf.as_mut_ptr() as i32,
                buf.len() as i32,
            )
        };
        if n < 0 {
            return None;
        }
        buf.truncate(n as usize);
        Some(buf)
    }

    fn storage_write(&mut self, name: &str, bytes: &[u8]) -> bool {
        let r = unsafe {
            storage_write(
                name.as_ptr() as i32,
                name.len() as i32,
                bytes.as_ptr() as i32,
                bytes.len() as i32,
            )
        };
        r == 0
    }

    fn task_push(&mut self, kind: &str, space_id: i64, video_id: i64, payload: &str) -> i64 {
        unsafe {
            task_push(
                kind.as_ptr() as i32,
                kind.len() as i32,
                space_id,
                video_id,
                payload.as_ptr() as i32,
                payload.len() as i32,
            )
        }
    }

    fn task_wait(&mut self, timeout_ms: i64, out: &mut [u8]) -> i32 {
        unsafe { task_wait(timeout_ms, out.as_mut_ptr() as i32, out.len() as i32) }
    }

    fn task_progress(&mut self, id: i64, current: i64, total: i64, label: &str) -> i32 {
        let lptr = if label.is_empty() {
            0i32
        } else {
            label.as_ptr() as i32
        };
        let llen = if label.is_empty() {
            0i32
        } else {
            label.len() as i32
        };
        unsafe { task_progress(id, current, total, lptr, llen) }
    }

    fn task_checkpoint(&mut self, id: i64) -> i32 {
        unsafe { task_checkpoint(id) }
    }

    fn task_done(&mut self, id: i64, fields_json: &str) -> i32 {
        unsafe { task_done(id, fields_json.as_ptr() as i32, fields_json.len() as i32) }
    }

    fn task_fail(&mut self, id: i64, message: &str, retry_at_ms: i64) -> i32 {
        unsafe {
            task_fail(
                id,
                message.as_ptr() as i32,
                message.len() as i32,
                retry_at_ms,
            )
        }
    }

    fn now_ms(&mut self) -> i64 {
        unsafe { now_ms() }
    }
}

fn text(at: i32, len: i32) -> String {
    let len = len.max(0) as usize;
    let bytes = unsafe { std::slice::from_raw_parts(at as *const u8, len) };
    String::from_utf8_lossy(bytes).into_owned()
}
