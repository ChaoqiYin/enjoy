//! The release the settings section is offering, in the terms the application
//! asks about it.
//!
//! The plugin's own `Update` has private fields, so nothing outside the plugin
//! can build one. Every rule that named a release therefore sat behind a seam no
//! test could cross: a case could be written, but no release could be handed to
//! it. The rule that came off worst is the one deciding whether bytes already
//! downloaded are still worth keeping — the only place in the application that
//! throws away what the user has waited for — while the two rules that were easy
//! to test, comparing two version strings and formatting a date, were lifted out
//! of it and tested on their own.
//!
//! [`Release`] states what the application needs from one: its version, what to
//! tell the interface, where the installer is, the signature it has to answer
//! to, and the handover to the platform installer. The plugin appears in exactly
//! one adapter — `impl Release for Update` — so both sides of the seam can make
//! one. This is [`crate::events::Events`] again: a value a test can build, not
//! one only a plugin can.

use reqwest::Url;
use serde::Serialize;
use tauri_plugin_updater::Update;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

/// One offered release, in the terms the application asks about it.
///
/// `Send + Sync` because the control holds one behind a mutex the whole
/// application shares.
pub trait Release: Send + Sync {
    /// The version being offered, which is what "a different offer" is decided
    /// by.
    fn version(&self) -> &str;

    /// What the settings section is told about it.
    fn describe(&self) -> AvailableUpdate;

    /// Where the installer is fetched from.
    fn download_url(&self) -> &Url;

    /// The signature the payload has to answer to.
    fn signature(&self) -> &str;

    /// Hands verified bytes to the platform installer.
    fn install(&self, bytes: &[u8]) -> Result<(), String>;
}

/// The updater plugin's release, answering the application's own interface.
///
/// The only adapter there is, and the only place in this module the plugin's
/// type appears. What it cannot do is install without being asked: the handover
/// is the plugin's, and it is reached through the same method a test's stand-in
/// is.
impl Release for Update {
    fn version(&self) -> &str {
        &self.version
    }

    fn describe(&self) -> AvailableUpdate {
        AvailableUpdate {
            version: self.version.clone(),
            current_version: self.current_version.clone(),
            notes: self.body.clone(),
            date: published_at(self.date),
        }
    }

    fn download_url(&self) -> &Url {
        &self.download_url
    }

    fn signature(&self) -> &str {
        &self.signature
    }

    fn install(&self, bytes: &[u8]) -> Result<(), String> {
        Update::install(self, bytes).map_err(|error| error.to_string())
    }
}

/// The release the user is being asked to install.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableUpdate {
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
    /// RFC 3339, which is the one string form the frontend turns back into an
    /// instant; it then formats that for the current language. See
    /// [`published_at`] for why this is not simply the date's own rendering.
    pub date: Option<String>,
}

/// The single shape `check_for_update` returns, covering every outcome so the
/// settings section renders from one value.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheck {
    pub supported: bool,
    pub current_version: String,
    pub available: Option<AvailableUpdate>,
    /// The installer is downloaded and verified; only a restart is missing. It
    /// is remembered in the backend so leaving the settings page and coming
    /// back still shows it.
    pub ready_to_restart: bool,
}

/// The publish date in the form the frontend parses.
///
/// `Update::date` is a `time::OffsetDateTime`, and its own rendering is not RFC
/// 3339: it comes out as `2026-09-26 14:34:10.0 +00:00:00`. JavaScript's `Date`
/// reads none of that — an offset carrying seconds is enough to fail on its own
/// — so `to_string` would hand the frontend an unreadable date. Formatting the
/// instant here, where its type is known, is what keeps the string on the wire
/// the same shape the release manifest arrived in.
///
/// A date that cannot be written is dropped rather than sent in another form:
/// the frontend renders what it can read and leaves the line out otherwise, and
/// a release note without its date is worth more than a screen that fails to
/// draw. Only years outside RFC 3339's range can fail, which no release has.
pub(super) fn published_at(date: Option<OffsetDateTime>) -> Option<String> {
    date.and_then(|date| date.format(&Rfc3339).ok())
}
