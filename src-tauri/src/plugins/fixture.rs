//! The runner-side double: a plugin's body a test makes for itself.
//!
//! Beside `events::Recorded` on the other side of the host — one double per
//! port, so that the rules this module exists for can be exercised without a
//! wasm module, a thread, or a deadline. What a body can do to the kernel is
//! four things, and there is one constructor for each of them: answer, throw,
//! run past its deadline, or answer something the kernel cannot read.

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

    /// A body that runs past its deadline and is interrupted.
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
