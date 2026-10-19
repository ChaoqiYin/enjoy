//! Cover fetcher: the working half of a plugin that finds a video's picture.
//!
//! The plugin is one directory with two files that matter — `plugin.json` and
//! the module this crate compiles to — and it has **no interface half**: it is
//! reached from the menu on a video and from nothing else
//! (docs/插件系统.md §14.4). What it answers, and what it is handed, is in the
//! mount point catalog (docs/插件挂载点目录.md).
//!
//! # The two mount points it answers
//!
//! - **`plugin.settings`** — the plugin asks the user for one thing: the page
//!   to look for covers on, with `{name}` standing for the video's file name.
//!   The user's answer arrives in the same call's params, and a plugin that is
//!   resident remembers it (docs/插件系统.md §14.8). A plugin reached from a
//!   video's menu never goes to the plugin page, so the kernel hands it what
//!   was saved once at startup — without that it would never learn the answer.
//! - **`video.fields`** — the plugin fetches that page, works out which picture
//!   on it is the cover, and hands back the **address**. The kernel downloads
//!   it and writes it into `$APPDATA/covers/`, because a plugin's `storage`
//!   capability reaches one file name inside its own directory and nothing else
//!   (docs/插件系统.md §14.3).
//!
//! # What is not here
//!
//! No `wasm-bindgen`: the runtime's interface is the module's own exports
//! (`alloc`, `handle`, `memory`) and the five functions it imports under the
//! name `enjoy`, and a second ABI on top of it would be a second thing to keep
//! in step (docs/adr/0044). No HTML parser either — see `cover.rs` for why.
//!
//! # How this crate is laid out
//!
//! Everything above the `host` module is the plugin's own logic, and it takes
//! the kernel as a parameter (`Host`) rather than reaching for it. That is what
//! lets the same code run in a test on this machine and inside the runtime,
//! where the two functions behind that trait are the wasm imports.

mod cover;
#[cfg(target_arch = "wasm32")]
mod host;

#[cfg(test)]
mod cover_tests;
#[cfg(test)]
mod plugin_tests;

use serde_json::{json, Value};

/// The mount points this plugin answers, spelled as the catalog spells them.
const PLUGIN_SETTINGS: &str = "plugin.settings";
const VIDEO_FIELDS: &str = "video.fields";

/// The field name the kernel understands as a video's picture.
///
/// The only field name the kernel knows (docs/插件系统.md §14.3): a plugin may
/// answer with fields of its own, but only this one is drawn as an image.
const COVER: &str = "cover";

/// The key of the one setting this plugin asks for.
const PAGE: &str = "url";

/// What the video's file name is written as in the page's address.
const PLACEHOLDER: &str = "{name}";

/// What one fetch came back with.
pub struct Response {
    /// The HTTP status, or `0` for a request that did not arrive — the
    /// runtime's own convention (`wasm/imports.rs`).
    pub status: u16,
    pub body: Vec<u8>,
}

/// The kernel, as this plugin's own code sees it.
///
/// The whole of what this plugin can do outside itself: fetch an address, and
/// write a line where the user can find it. There is no file system here and no
/// database, because a body is granted four things and these are the two this
/// one declared (docs/adr/0043 §4).
pub trait Host {
    /// Fetches one address, or `None` if the request did not arrive.
    fn get(&mut self, url: &str) -> Option<Response>;
    /// Writes one line to the kernel's log, under this plugin's name.
    fn note(&mut self, line: &str);
}

/// The plugin, and what it remembers between calls.
///
/// A body is resident for as long as the plugin is enabled (docs/adr/0044 §2),
/// so this is where the user's answer to `plugin.settings` lives between the
/// call that delivered it and the call that needs it.
pub struct CoverFetcher {
    /// The page the user filled in, empty until they have.
    page: String,
}

impl CoverFetcher {
    pub const fn new() -> Self {
        Self {
            page: String::new(),
        }
    }

    /// One call: the method and its params in, the answer out.
    ///
    /// Every answer is text and every answer is a valid answer — a plugin that
    /// cannot do what it was asked says so with an empty contribution rather
    /// than by failing, because a failure is the same thing to the kernel
    /// (docs/adr/0043 §5) with a notification attached.
    pub fn answer(&mut self, method: &str, params: &str, host: &mut dyn Host) -> String {
        let Ok(params) = serde_json::from_str::<Value>(params) else {
            host.note("the params of this call were not readable");
            return self.empty(method);
        };
        match method {
            PLUGIN_SETTINGS => self.settings(&params),
            VIDEO_FIELDS => self.fields(&params, host),
            // `video.actions` is here too: the menu item is what makes the
            // kernel ask this plugin, and the field is the answer. There is
            // nothing for the action itself to say.
            _ => self.empty(method),
        }
    }

    /// An answer that contributes nothing, in the shape the mount point declares.
    ///
    /// The shape is not decoration. `video.fields` answers with a list of
    /// fields and the kernel reads it as one, so contributing nothing there is
    /// an **empty list** and not an empty object: an answer the kernel cannot
    /// read is a call the plugin failed, which costs it a strike and puts a
    /// notification in front of the user for having done nothing wrong
    /// (docs/adr/0043 §5).
    fn empty(&self, method: &str) -> String {
        if method == VIDEO_FIELDS {
            json!({ "fields": [] }).to_string()
        } else {
            json!({}).to_string()
        }
    }

    /// The declaration the kernel draws the form from, and the answer to it.
    ///
    /// Both halves are this one call because the kernel asks again when the
    /// user saves, and that second question is also the delivery
    /// (docs/插件系统.md §14.8). A plugin that answered with its declaration
    /// and ignored the values would never hear what the user typed.
    fn settings(&mut self, params: &Value) -> String {
        if let Some(page) = value_of(&params["values"], PAGE) {
            self.page = page;
        }
        json!({
            "fields": [{
                "key": PAGE,
                "kind": "text",
                "label": "A page to look for covers on, with {name} for the video's file name",
                "required": true,
            }]
        })
        .to_string()
    }

    /// The video's picture, as an address for the kernel to download.
    fn fields(&self, params: &Value, host: &mut dyn Host) -> String {
        match self.cover(params, host) {
            Some(address) => json!({
                "fields": [{ "key": COVER, "value": address }]
            })
            .to_string(),
            None => self.empty(VIDEO_FIELDS),
        }
    }

    /// Fetches the page and finds the picture on it, saying why when it cannot.
    fn cover(&self, params: &Value, host: &mut dyn Host) -> Option<String> {
        if self.page.is_empty() {
            host.note("no page has been filled in, so there is nothing to look at");
            return None;
        }
        let url = match file_name(params) {
            Some(name) => self.page.replace(PLACEHOLDER, &name),
            None => self.page.clone(),
        };
        let Some(response) = host.get(&url) else {
            host.note(&format!("the page at {url} could not be reached"));
            return None;
        };
        if !(200..300).contains(&response.status) {
            host.note(&format!("the page at {url} answered {}", response.status));
            return None;
        }
        let Ok(page) = String::from_utf8(response.body) else {
            host.note(&format!("the page at {url} is not text"));
            return None;
        };
        let address = cover::address_in(&page, &url);
        match address.as_deref() {
            Some(address) => host.note(&format!("the page at {url} names {address}")),
            None => host.note(&format!("the page at {url} names no picture")),
        }
        address
    }
}

/// The value the user filled in for one key, if they have.
fn value_of(values: &Value, key: &str) -> Option<String> {
    values
        .as_array()?
        .iter()
        .find(|entry| entry["key"] == key)?["value"]
        .as_str()
        .map(str::to_string)
}

/// The video's file name, without its extension or the directory it is in.
///
/// A page about a video is a page about the video's name: the path is where it
/// happens to live on this machine, and that is nobody else's business.
fn file_name(params: &Value) -> Option<String> {
    let path = params["video"]["path"].as_str()?;
    let name = path.rsplit(['/', '\\']).next()?;
    let stem = name.rsplit_once('.').map_or(name, |(stem, _)| stem);
    (!stem.is_empty()).then(|| stem.to_string())
}
