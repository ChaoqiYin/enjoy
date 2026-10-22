//! JavBus scraper plugin

#[cfg(target_arch = "wasm32")]
mod host;
#[cfg(target_arch = "wasm32")]
mod run;

pub mod failure;
pub mod javbus;
pub mod number;
pub mod rate;

use serde_json::{json, Value};

const PLUGIN_SETTINGS: &str = "plugin.settings";
const VIDEO_ACTIONS: &str = "video.actions";

pub struct Response {
    pub status: u16,
    pub body: Vec<u8>,
}

pub trait Host {
    fn get_with_headers(&mut self, url: &str, headers_json: &str) -> Option<Response>;
    fn log(&mut self, line: &str);
    fn storage_read(&mut self, name: &str) -> Option<Vec<u8>>;
    fn storage_write(&mut self, name: &str, bytes: &[u8]) -> bool;
    fn task_push(&mut self, kind: &str, space_id: i64, video_id: i64, payload: &str) -> i64;
    fn task_wait(&mut self, timeout_ms: i64, out: &mut [u8]) -> i32;
    fn task_progress(&mut self, id: i64, current: i64, total: i64, label: &str) -> i32;
    fn task_checkpoint(&mut self, id: i64) -> i32;
    fn task_done(&mut self, id: i64, fields_json: &str) -> i32;
    fn task_fail(&mut self, id: i64, message: &str, retry_at_ms: i64) -> i32;
    fn now_ms(&mut self) -> i64;
}

pub struct Scraper {
    site: String,
    cookie: String,
}

impl Default for Scraper {
    fn default() -> Self {
        Self::new()
    }
}

impl Scraper {
    pub fn new() -> Self {
        Self {
            site: "https://www.javbus.com".to_string(),
            cookie: String::new(),
        }
    }

    pub fn answer(&mut self, method: &str, params: &str, host: &mut dyn Host) -> String {
        let Ok(params) = serde_json::from_str::<Value>(params) else {
            host.log("params not readable");
            return self.empty(method);
        };
        match method {
            PLUGIN_SETTINGS => self.settings(&params, host),
            VIDEO_ACTIONS => self.actions(&params, host),
            _ => self.empty(method),
        }
    }

    fn empty(&self, _method: &str) -> String {
        json!({}).to_string()
    }

    fn settings(&mut self, params: &Value, host: &mut dyn Host) -> String {
        if let Some(vals) = params.get("values").and_then(|v| v.as_array()) {
            for v in vals {
                if v["key"] == "site" {
                    if let Some(s) = v["value"].as_str() {
                        if !s.is_empty() {
                            self.site = s.trim_end_matches('/').to_string();
                        }
                    }
                }
                if v["key"] == "cookie" {
                    if let Some(s) = v["value"].as_str() {
                        self.cookie = s.to_string();
                    }
                }
            }
        }
        // persist
        let cfg = json!({"site": self.site, "cookie": self.cookie}).to_string();
        let _ = host.storage_write("settings.json", cfg.as_bytes());
        json!({
            "fields": [
                {"key": "site", "kind": "text", "label": "站点地址", "required": false},
                {"key": "cookie", "kind": "textarea", "label": "Cookie（可选）", "required": false},
            ]
        })
        .to_string()
    }

    fn actions(&mut self, params: &Value, host: &mut dyn Host) -> String {
        let space_id = params["space"]["id"].as_i64().unwrap_or(0);
        let video_id = params["video"]["id"].as_i64().unwrap_or(0);
        let path = params["video"]["path"].as_str().unwrap_or("").to_string();
        let payload = json!({"path": path}).to_string();
        let _ = host.task_push("scrape", space_id, video_id, &payload);
        json!({}).to_string()
    }
}
