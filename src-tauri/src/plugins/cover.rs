//! The picture behind the one field name the kernel knows.
//!
//! A plugin answers `video.fields` with `{"key": "cover", "value": "..."}`, and
//! what the value is depends on which half of the job the plugin did. Two
//! readings are possible and only one of them works:
//!
//! - **the plugin hands back a path**, which means the plugin put the image
//!   somewhere. It cannot: its `storage` capability reaches one file name inside
//!   its own data directory and nothing else (`wasm::imports`), so there is no
//!   path it could name that the window can draw.
//! - **the plugin hands back an address**, and the kernel fetches it, writes the
//!   image into `$APPDATA/covers/`, and stores the path instead.
//!
//! The second is the reading this module implements, and the reason is not
//! convenience: the window draws pictures through Tauri's asset protocol, which
//! serves files from a few local directories and no others, and the content
//! security policy the application ships with has no remote source in `img-src`.
//! An `<img>` pointing at somebody's website is therefore a picture that cannot
//! be drawn, whatever the plugin meant by it. The image has to land on this
//! machine, and the only thing on this machine that can write outside a plugin's
//! own directory is the kernel.
//!
//! So the two halves of a cover plugin's job are: the plugin uses `fetch` to
//! reach the site and work out *which* image it wants — which is what the
//! capability is for — and the kernel does the last step, which is the one step
//! the plugin is not allowed to do. What lands in `video_fields` is a path
//! either way, which is what the catalog promises
//! (`shared/plugins/mount-points.json`, `FieldValue.value`).
//!
//! # What it does when the fetch fails
//!
//! Nothing is written for that field, and the value the record already had
//! stands. `save_fields` adds and replaces and never deletes, so leaving the
//! field out of the batch is the whole of "keep what was there": a cover that
//! was fetched last week does not go away because the site is down today. What
//! it must not do is store the address — the interface would draw a broken
//! picture where it had a good one, which is worse than the stale picture.

use std::path::Path;
use std::sync::OnceLock;
use std::time::Duration;

use crate::model::{VideoField, COVER_FIELD};

/// How long a cover is given to arrive.
///
/// A deadline of its own rather than none, because this one runs inside a
/// command the user is waiting on: a site that accepts the connection and then
/// says nothing would hold the drawer open for as long as it liked. It is not
/// the plugin's deadline (`wasm::CALL_DEADLINE`) and is not meant to be — that
/// one bounds a plugin's own work, and this is the kernel's.
const DEADLINE: Duration = Duration::from_secs(20);

/// How much of an image the kernel will keep.
///
/// A cover is a picture on a card. Anything past this is not one, and the server
/// at the other end is the one choosing how much it sends — the same reason
/// `fetch` has a limit of its own. Reaching it is a failure rather than a
/// truncation, unlike `fetch`: a plugin handed a shortened body can see that it
/// was and decide what to do, while half an image written to disk is a picture
/// the window tries to draw and cannot.
const LIMIT: usize = 8 * 1024 * 1024;

/// The extensions an image is accepted under, and the one each is written as.
///
/// `jpeg` and `jpg` are one thing written two ways, so they land as one: a
/// directory of covers that mixes the two is a directory where the same picture
/// has two names.
const EXTENSIONS: [(&str, &str); 6] = [
    ("jpg", "jpg"),
    ("jpeg", "jpg"),
    ("png", "png"),
    ("webp", "webp"),
    ("gif", "gif"),
    ("avif", "avif"),
];

/// The content types the same extensions answer to.
const TYPES: [(&str, &str); 6] = [
    ("image/jpeg", "jpg"),
    ("image/png", "png"),
    ("image/webp", "webp"),
    ("image/gif", "gif"),
    ("image/avif", "avif"),
    ("image/bmp", "bmp"),
];

/// Settles the cover in one record's answer, in place.
///
/// The plugin's half is over by the time this runs: `fields` is what the chain
/// answered. What is left is the kernel's half, and the two cases are the two
/// lines below — an address is fetched and becomes a path, and anything else is
/// already a path and is left alone. A plugin is allowed to answer with a path
/// it worked out some other way, and the kernel has no business asking how.
pub(crate) async fn settle(directory: &Path, video_id: i64, fields: &mut Vec<VideoField>) {
    let Some(at) = fields.iter().position(|field| field.key == COVER_FIELD) else {
        return;
    };
    if !is_address(&fields[at].value) {
        return;
    }
    let address = fields[at].value.clone();
    match fetch(directory, video_id, &address).await {
        Ok(path) => fields[at].value = path,
        Err(reason) => {
            tracing::warn!(
                plugin = %fields[at].source_plugin,
                %address,
                %reason,
                "a plugin's cover could not be fetched; the record keeps the picture it had"
            );
            fields.remove(at);
        }
    }
}

/// Whether a value is something to fetch rather than something to store.
///
/// Only the two schemes the asset protocol could never serve, and both of them
/// spelled out: a plugin that answers with a bare `www.example.com/x.jpg` is
/// answering with a path, and a path is what the kernel stores.
fn is_address(value: &str) -> bool {
    value.starts_with("http://") || value.starts_with("https://")
}

/// Fetches one image and writes it where the window can draw it.
async fn fetch(directory: &Path, video_id: i64, address: &str) -> Result<String, String> {
    let client = client().ok_or_else(|| "there is no HTTP client".to_string())?;
    let response = client
        .get(address)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("the server answered {}", response.status()));
    }
    let kind = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());
    let extension = extension(address, kind.as_deref())?;
    let mut body = Vec::new();
    let mut response = response;
    while body.len() < LIMIT {
        match response.chunk().await {
            Ok(Some(chunk)) => body.extend_from_slice(&chunk),
            Ok(None) => break,
            Err(error) => return Err(error.to_string()),
        }
    }
    if body.len() >= LIMIT {
        return Err(format!(
            "the image is past the {LIMIT} bytes a cover may be"
        ));
    }
    std::fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let path = directory.join(format!("{video_id}.{extension}"));
    std::fs::write(&path, &body).map_err(|error| error.to_string())?;
    // After the write and not before: a video whose new cover did not arrive is
    // a video whose record still names the old file, and the old file has to
    // still be there when it does.
    clear(directory, video_id, &path);
    Ok(path.to_string_lossy().into_owned())
}

/// Takes the covers this video already had out of the way, keeping the one just
/// written.
///
/// One video has one picture, and a plugin that answers with a different kind of
/// image the second time would otherwise leave the first one behind: the record
/// names the new file and the old one stays in the directory for good, with
/// nothing left anywhere that names it. A video's id is the whole of its
/// covers' name, so what can be recognised as this video's is exactly this
/// video's and never another's.
fn clear(directory: &Path, video_id: i64, keep: &Path) {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return;
    };
    let name = video_id.to_string();
    for path in entries.flatten().map(|entry| entry.path()) {
        let mine = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .is_some_and(|stem| stem == name);
        if mine && path != keep {
            let _ = std::fs::remove_file(&path);
        }
    }
}

/// What the image is written as.
///
/// The address's own extension first, because a site that serves
/// `photo-1.jpeg` is saying what it is, and the content type second for the
/// addresses that do not — a query string, a route with no file at the end, a
/// CDN that names its objects after hashes. Neither is guessed at: an image
/// written under the wrong extension is served under the wrong media type by the
/// asset protocol, and a picture the browser refuses is not a cover.
fn extension(address: &str, kind: Option<&str>) -> Result<&'static str, String> {
    let named = Path::new(address.split(['?', '#']).next().unwrap_or(address))
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase);
    if let Some(extension) = named.as_deref().and_then(known_extension) {
        return Ok(extension);
    }
    let kind = kind
        .unwrap_or_default()
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    TYPES
        .iter()
        .find(|(served, _)| *served == kind)
        .map(|(_, extension)| *extension)
        .ok_or_else(|| format!("nothing says what kind of image this is ({kind:?})"))
}

fn known_extension(extension: &str) -> Option<&'static str> {
    EXTENSIONS
        .iter()
        .find(|(named, _)| *named == extension)
        .map(|(_, written)| *written)
}

/// The client covers are fetched through, made once for the process.
///
/// Its own rather than the plugin `fetch` client's (`wasm::imports`), and the
/// difference is the deadline: that one has none, because the call it belongs to
/// already has one of its own. This one is reached from a command with no
/// deadline around it, so the bound has to be here.
fn client() -> Option<&'static reqwest::Client> {
    static CLIENT: OnceLock<Option<reqwest::Client>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            // Installed here for the reason the plugin client gives: this one
            // needs a TLS backend, and depending on whatever else happened to
            // install one would make fetching a cover depend on an update check
            // having run first.
            if rustls::crypto::CryptoProvider::get_default().is_none() {
                let _ = rustls::crypto::ring::default_provider().install_default();
            }
            match reqwest::Client::builder()
                .user_agent(concat!("Enjoy/", env!("CARGO_PKG_VERSION")))
                .timeout(DEADLINE)
                .build()
            {
                Ok(client) => Some(client),
                Err(error) => {
                    tracing::error!(%error, "there is no HTTP client for plugin covers");
                    None
                }
            }
        })
        .as_ref()
}
