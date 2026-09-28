//! What the application remembers between runs, and the one file it is in.
//!
//! Language, theme, the 共享服务's password: three things that outlive the
//! process, written to `preferences.json` and read back at startup. Before this
//! module there were three modules that each knew the file, opened it
//! themselves, and each carried their own copy of what to do when a write fails
//! — put back what was there, so the file never holds a value the application
//! did not accept. Three copies of one rule is three chances for them to differ,
//! and the failure path they guard is the one nobody exercises by hand.
//!
//! So the rule moves here and the three callers keep their own meaning: what a
//! language *is* stays in `i18n`, what a password is drawn from stays in
//! `share::credentials`, and both come here to have it kept.
//!
//! The store is a seam with two adapters: the file ([`store`]), and a map in
//! memory that can be told to fail ([`tests`]). The second is why the seam
//! exists — a rule whose failure path has never been run is a rule nobody has
//! checked, and the failure path here needs a write that cannot be made.

#[cfg(test)]
pub(crate) mod fixture;
pub(crate) mod store;
#[cfg(test)]
mod tests;

use crate::error::AppError;

/// The one file every preference lives in. One file rather than one per
/// preference, which is what makes writing two of them one write: a language
/// and a theme that disagreed about which of them was kept would be a settings
/// page showing one thing and an interface drawn in another.
pub(crate) const FILE: &str = "preferences.json";

/// The languages the interface can be read in, `system` among them: the one set
/// of values that language may hold, in the one place it is written down.
pub(crate) const LANGUAGES: &[&str] = &["system", "zh-CN", "en"];

/// The themes the interface can be drawn in, `system` among them.
pub(crate) const THEMES: &[&str] = &["system", "light", "dark"];

/// One of the things this file holds.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Preference {
    /// The language the interface is written in, or `system` to follow the
    /// machine's own.
    Language,
    /// The theme, or `system` to follow the machine's own.
    Theme,
    /// The password a client signs in to the 共享服务 with.
    SharePassword,
}

/// What this preference is called in the file, what it may hold, and what it
/// means to hold nothing.
struct Spec {
    key: &'static str,
    /// The values this preference may take, or none where any string will do.
    allowed: Option<&'static [&'static str]>,
    /// What is in force when nothing usable is stored: the first run, and the
    /// same answer a value outside the set above reads as. For the password it
    /// is empty, which is not a password — the caller that owns it draws one.
    default: &'static str,
}

impl Preference {
    fn spec(self) -> Spec {
        match self {
            Preference::Language => Spec {
                key: "language",
                allowed: Some(LANGUAGES),
                default: "system",
            },
            Preference::Theme => Spec {
                key: "theme",
                allowed: Some(THEMES),
                default: "system",
            },
            Preference::SharePassword => Spec {
                key: "sharePassword",
                allowed: None,
                default: "",
            },
        }
    }
}

/// A place preferences can be kept, and the whole of what this module needs from
/// one: read a value back, and write values that either all land or none do.
///
/// The all-or-none is the store's promise rather than this module's because it
/// is the store that can break it: a plugin that keeps values in memory and
/// writes them out in one go holds something the file does not when that write
/// fails, and only it can put that right.
pub(crate) trait Backing {
    /// The value stored under a key, or nothing.
    fn get(&self, key: &str) -> Option<String>;

    /// Writes every pair, or none of them.
    fn set(&self, values: &[(&str, &str)]) -> Result<(), String>;
}

/// The preferences, over whichever store they are being kept in.
pub(crate) struct Preferences<B> {
    backing: B,
}

impl<B: Backing> Preferences<B> {
    pub(crate) fn new(backing: B) -> Self {
        Self { backing }
    }

    /// What is in force for this preference: what is stored, or what it falls
    /// back to when nothing usable is.
    ///
    /// A stored value outside the set the preference allows is not a
    /// preference — written by hand, or left by a version that had another
    /// language — so it reads as the default, which is what a first run reads.
    /// Nothing is written back on the way: a file that says something this
    /// application does not understand is left for whoever put it there.
    pub(crate) fn read(&self, which: Preference) -> String {
        let spec = which.spec();
        self.backing
            .get(spec.key)
            .filter(|value| {
                spec.allowed
                    .is_none_or(|allowed| allowed.contains(&value.as_str()))
            })
            .unwrap_or_else(|| spec.default.to_string())
    }

    /// Keeps these preferences, all of them or none.
    ///
    /// Every value is checked before anything is written, so a call that is
    /// refused leaves the file exactly as it was — which is the rule the three
    /// copies of this used to state for themselves.
    pub(crate) fn write(&self, values: &[(Preference, &str)]) -> Result<(), AppError> {
        for (which, value) in values {
            let spec = which.spec();
            if let Some(allowed) = spec.allowed {
                // A field out of a window is not to be trusted with what this
                // application is willing to hold, which is the whole reason
                // this is checked here rather than by the callers.
                if !allowed.contains(value) {
                    return Err(AppError::new(
                        "settings.invalid",
                        format!("{value} is not a value {} may hold", spec.key),
                    ));
                }
            }
        }
        let pairs: Vec<(&str, &str)> = values
            .iter()
            .map(|(which, value)| (which.spec().key, *value))
            .collect();
        self.backing
            .set(&pairs)
            .map_err(|error| AppError::new("settings.save_failed", error))
    }
}
