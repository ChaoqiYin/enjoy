//! The preferences rule, over a store that can be told to fail.
//!
//! The file itself needs a running application to open, so what is checked here
//! is the rule rather than the file: which values are allowed, what an unknown
//! one reads as, and what a refused write leaves behind. The adapter that keeps
//! the same promise over `tauri-plugin-store` is not covered by these — it needs
//! the application too — and its own repair (the map put back after a failed
//! save) is the part of this that only a real plugin can exercise.

use super::fixture::Memory;
use super::{Preference, Preferences, LANGUAGES, THEMES};

#[test]
fn a_preference_nothing_was_ever_written_for_reads_as_its_default() {
    let preferences = Preferences::new(Memory::default());
    assert_eq!(preferences.read(Preference::Language), "system");
    assert_eq!(preferences.read(Preference::Theme), "dark");
    // Empty, and empty is not a password: the module that owns this one draws
    // one when it reads this.
    assert_eq!(preferences.read(Preference::SharePassword), "");
}

#[test]
fn a_stored_value_outside_the_set_is_not_a_preference() {
    // Written by an older version, or by hand. It reads as the default, and it
    // is not written over on the way: the file is left as its author left it.
    let memory = Memory::holding(&[("language", "fr-FR"), ("theme", "sepia")]);
    let preferences = Preferences::new(memory);
    assert_eq!(preferences.read(Preference::Language), "system");
    assert_eq!(preferences.read(Preference::Theme), "dark");
}

#[test]
fn what_was_written_is_what_the_next_read_answers() {
    // The point of there being one owner: the value that was kept is the value
    // in force, with no second copy to fall behind it.
    let preferences = Preferences::new(Memory::default());
    preferences
        .write(&[(Preference::Language, "zh-CN"), (Preference::Theme, "dark")])
        .unwrap();
    assert_eq!(preferences.read(Preference::Language), "zh-CN");
    assert_eq!(preferences.read(Preference::Theme), "dark");
}

#[test]
fn a_value_the_preference_cannot_hold_is_refused_before_anything_is_written() {
    let preferences = Preferences::new(Memory::holding(&[("language", "en")]));
    let refused = preferences
        .write(&[(Preference::Language, "fr")])
        .unwrap_err();
    assert_eq!(refused.code, "settings.invalid");
    assert_eq!(preferences.read(Preference::Language), "en");
}

#[test]
fn a_write_of_two_preferences_is_all_or_nothing() {
    // The settings page saves both at once, and a language that landed while
    // the theme was refused would be a page showing one thing and an interface
    // drawn in another.
    let preferences = Preferences::new(Memory::holding(&[("language", "en")]));
    let refused = preferences
        .write(&[
            (Preference::Language, "zh-CN"),
            (Preference::Theme, "sepia"),
        ])
        .unwrap_err();
    assert_eq!(refused.code, "settings.invalid");
    assert_eq!(preferences.read(Preference::Language), "en");
}

#[test]
fn a_store_that_refuses_the_write_leaves_nothing_behind() {
    let preferences = Preferences::new(Memory::failing());
    let refused = preferences
        .write(&[(Preference::Language, "zh-CN")])
        .unwrap_err();
    assert_eq!(refused.code, "settings.save_failed");
    // Which is the same answer as before the attempt, since nothing was kept.
    assert_eq!(preferences.read(Preference::Language), "system");
}

#[test]
fn the_two_value_sets_are_the_ones_the_interface_is_written_in() {
    // Named here as the interface's own vocabulary: a language added on that
    // side without a translation, or a theme the stylesheet has no colours for,
    // would be a preference that can be stored and cannot be honoured.
    assert_eq!(LANGUAGES, &["system", "zh-CN", "en"]);
    assert_eq!(THEMES, &["light", "dark"]);
}
