//! The runner-side double: a plugin's body a test makes for itself.
//!
//! Beside `events::Recorded` on the other side of the host — one double per
//! port, so that the rules this module exists for can be exercised without a
//! wasm module, a thread, or a deadline. What a body can do to the kernel is
//! four things, and there is one constructor for each of them: answer, throw,
//! run past its deadline, or answer something the kernel cannot read.
//!
//! It also holds the loading tests' half of the harness: [`Installed`], a
//! directory with plugins laid out in it, because what loading is about is what
//! is on disk. Two doubles for two sides of the same module is what this file
//! is, and neither of them is written by the application.
//!
//! [`serving`] is the third: a server on the loopback, because the cover is the
//! one field whose value the kernel goes and gets, and a test about it that did
//! not have a server to fetch from would be a test about the code that reads the
//! answer rather than about the answer arriving.

use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::de::DeserializeOwned;

use crate::events::Recorded;

use super::mount_points::{
    FieldValue, PluginSettingsResult, SettingField, SettingFieldKind, SpaceRef, VideoFieldsResult,
    VideoRef,
};
use super::runner::{Runner, RunnerError};
use super::PluginHost;

/// A host whose interface writes down what it was told.
pub(crate) fn host() -> (PluginHost, Arc<Recorded>) {
    let events = Arc::new(Recorded::default());
    (PluginHost::new(events.clone()), events)
}

/// The space every test's calls are made in.
pub(crate) fn space() -> SpaceRef {
    SpaceRef { id: 1 }
}

/// The video every test's calls are about.
pub(crate) fn video() -> VideoRef {
    VideoRef {
        id: 7,
        path: "/library/one.mp4".to_string(),
    }
}

/// The JSON a body answers `video.fields` with.
pub(crate) fn fields(values: &[(&str, &str)]) -> String {
    serde_json::to_string(&VideoFieldsResult {
        fields: values
            .iter()
            .map(|(key, value)| FieldValue {
                key: key.to_string(),
                value: value.to_string(),
            })
            .collect(),
    })
    .unwrap()
}

/// The JSON a body answers `plugin.settings` with.
///
/// The label is the key, which is all a test needs to read back: what a label
/// says is the plugin's business and is not part of any rule here.
pub(crate) fn settings(fields: &[(&str, SettingFieldKind)]) -> String {
    serde_json::to_string(&PluginSettingsResult {
        fields: fields
            .iter()
            .map(|(key, kind)| SettingField {
                key: key.to_string(),
                kind: *kind,
                label: key.to_string(),
                required: false,
            })
            .collect(),
    })
    .unwrap()
}

/// What a body does when it is asked: the answer it gives, or the way it
/// failed. Spelled once because it is what every constructor below hands over.
type Answer = Box<dyn Fn(&str, &str) -> Result<String, RunnerError> + Send + Sync>;

/// One plugin's working half, as a test holds it.
pub(crate) struct FakeBody {
    answer: Answer,
    asked: Mutex<Vec<(String, String)>>,
}

impl FakeBody {
    /// A body that does whatever the test says when it is asked.
    ///
    /// The escape hatch the four constructors below are written from, for the
    /// tests that need one body to behave differently at two mount points.
    pub(crate) fn doing(
        answer: impl Fn(&str, &str) -> Result<String, RunnerError> + Send + Sync + 'static,
    ) -> Arc<Self> {
        Arc::new(Self {
            answer: Box::new(answer),
            asked: Mutex::new(Vec::new()),
        })
    }

    /// A body that answers every call with this JSON.
    pub(crate) fn answering(json: impl Into<String>) -> Arc<Self> {
        let json = json.into();
        Self::doing(move |_, _| Ok(json.clone()))
    }

    /// A body that throws.
    pub(crate) fn failing() -> Arc<Self> {
        Self::doing(|method, _| Err(RunnerError::Failed(format!("{method} threw"))))
    }

    /// A body that comes back saying it ran past its deadline.
    ///
    /// What a real one does first is not reproducible here — it hangs, and
    /// something has to end the call (`super::runner`'s contract). What the
    /// host does with the answer is the same either way.
    pub(crate) fn timing_out() -> Arc<Self> {
        Self::doing(|_, _| Err(RunnerError::TimedOut))
    }

    /// A body that answers with something the kernel cannot read.
    pub(crate) fn garbling() -> Arc<Self> {
        Self::answering("not what the catalog declares")
    }

    /// A body that takes its time before answering.
    pub(crate) fn slow(json: impl Into<String>, taking: Duration) -> Arc<Self> {
        let json = json.into();
        Self::doing(move |_, _| {
            std::thread::sleep(taking);
            Ok(json.clone())
        })
    }

    /// What it was asked, in order: (method, payload).
    pub(crate) fn asked(&self) -> Vec<(String, String)> {
        self.asked.lock().unwrap().clone()
    }

    /// How many times it was asked anything.
    pub(crate) fn asked_times(&self) -> usize {
        self.asked.lock().unwrap().len()
    }

    /// What it was handed on one call, as that mount point's params.
    pub(crate) fn params_of<T: DeserializeOwned>(&self, method: &str, at: usize) -> T {
        let payloads: Vec<String> = self
            .asked()
            .into_iter()
            .filter(|(asked, _)| asked == method)
            .map(|(_, payload)| payload)
            .collect();
        serde_json::from_str(&payloads[at]).unwrap()
    }
}

impl Runner for FakeBody {
    fn handle(&self, method: &str, payload: &str) -> Result<String, RunnerError> {
        self.asked
            .lock()
            .unwrap()
            .push((method.to_string(), payload.to_string()));
        (self.answer)(method, payload)
    }
}

static NEXT: AtomicU64 = AtomicU64::new(0);

/// A plugins directory a test lays plugins out in, removed when it drops.
///
/// The application never writes a plugin's directory — that is the user's, or
/// the installer's — so a test builds the disk it wants to be looking at, one
/// call per plugin, rather than driving the install path to get there. A test
/// about installing is the one exception, and it builds its source the same
/// way.
pub(crate) struct Installed(PathBuf);

impl Installed {
    pub(crate) fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "enjoy-plugins-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }

    /// The directory itself, for the calls that take one.
    pub(crate) fn path(&self) -> &Path {
        &self.0
    }

    /// Writes one plugin's directory, manifest and all.
    pub(crate) fn plugin(&self, id: &str, manifest: &serde_json::Value) -> PathBuf {
        self.plugin_text(id, &serde_json::to_string_pretty(manifest).unwrap())
    }

    /// The same, with the manifest's text given rather than built — for the
    /// tests whose subject is a manifest that is not JSON at all.
    pub(crate) fn plugin_text(&self, id: &str, manifest: &str) -> PathBuf {
        let directory = self.0.join(id);
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join(super::manifest::FILE), manifest).unwrap();
        directory
    }

    /// Writes one file into a plugin's directory: its body module, its
    /// interface entry, or whatever else its manifest names.
    pub(crate) fn file(&self, id: &str, name: &str, bytes: &[u8]) {
        fs::write(self.0.join(id).join(name), bytes).unwrap();
    }

    /// A directory with no manifest in it: something else the user left in the
    /// plugins directory, which is not a plugin.
    pub(crate) fn stray(&self, name: &str) -> PathBuf {
        let directory = self.0.join(name);
        fs::create_dir_all(&directory).unwrap();
        directory
    }

    /// What is in the plugins directory now, sorted, directories only.
    pub(crate) fn contents(&self) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(&self.0)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.path().is_dir())
            .map(|entry| entry.file_name().to_string_lossy().to_string())
            .collect();
        names.sort();
        names
    }
}

impl Drop for Installed {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// A server on the loopback that answers every request with one fixed reply,
/// and the address it is reachable at.
///
/// Written out by hand rather than served through a framework: what is being
/// tested is the kernel's own fetching, and a server with opinions of its own
/// would be one more thing standing between the two.
pub(crate) fn serving(status: &str, headers: &str, body: &[u8]) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").expect("a port on the loopback");
    let address = format!("http://{}", listener.local_addr().expect("a bound address"));
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Length: {}\r\n{headers}Connection: close\r\n\r\n",
        body.len()
    );
    let (head, body) = (head.into_bytes(), body.to_vec());
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { break };
            let mut request = [0u8; 2048];
            let _ = stream.read(&mut request);
            let _ = stream.write_all(&head);
            let _ = stream.write_all(&body);
        }
    });
    address
}

/// A manifest that passes every check, as a test starts from it.
///
/// A test changes the one thing it is about, so that what it is testing is the
/// difference it made rather than the twenty lines around it.
pub(crate) fn manifest(id: &str) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "name": id,
        "author": "someone",
        "apiVersion": super::manifest::API_VERSION,
        "capabilities": [],
        "interface": "index.js",
    })
}
