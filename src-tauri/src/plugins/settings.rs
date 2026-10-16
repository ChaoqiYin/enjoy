//! What the kernel does with a plugin's settings, which is the whole of what the
//! plugin does not do itself: it reads what the user filled in, checks it against
//! what the plugin asked for, and hands it back.
//!
//! The catalog's one line about `plugin.settings` is 「内核问插件「用户必须填什么」，
//! 然后自己渲染、校验、保存」, and this file is the two halves of that sentence that
//! are not the host's: the check and the hand-over. Rendering is the interface's
//! (`frontend/src/plugins/PluginSettingsForm.tsx`), saving is the repository's
//! (`repository/plugin_settings.rs`), and asking is [`crate::plugins::dispatch`]'s.
//!
//! Why the kernel checks at all rather than trusting the form: one of the four
//! kinds is a directory, and whether a directory exists is a fact about the
//! machine that only this side knows. The interface picks one through the
//! platform's picker, but what it hands over is a string, and a string can say
//! anything — a folder that was moved, a folder on a drive that is not mounted,
//! a value that never came from the picker at all.
//!
//! A refusal is per field and not per form: User Story 28 asks for the reason to
//! stay **beside the field it is about**, because the user's next act is to
//! change that value and not to work out which of six values was wrong. So a
//! refusal names the field in its params and the interface draws it there
//! (baseline §14.8).

use std::collections::BTreeMap;
use std::path::Path;

use serde::Serialize;

use crate::error::AppError;
use crate::model::PluginSetting;
use crate::plugins::mount_points::{SettingField, SettingFieldKind, SettingValue, SpaceRef};
use crate::plugins::{PluginHost, PluginSettings};
use crate::repository::Repository;

/// One setting as the plugin page draws it.
///
/// What the plugin asked for, plus what the user has filled in. The `label` is
/// the plugin's own words and is drawn as they are: the kernel has no vocabulary
/// for a plugin's settings to translate.
#[derive(Debug, Clone, Serialize)]
pub struct PluginSettingField {
    pub key: String,
    pub kind: SettingFieldKind,
    pub label: String,
    pub required: bool,
    /// What the user filled in, or the empty string if they never have.
    pub value: String,
}

/// One plugin's settings, as the plugin page draws them.
///
/// The group names the plugin and nothing else: the page draws these inside that
/// plugin's own row, under the name the row already carries, so a second copy of
/// the name here would be a second thing to keep in step.
#[derive(Debug, Clone, Serialize)]
pub struct PluginSettingsGroup {
    pub plugin: String,
    pub fields: Vec<PluginSettingField>,
}

/// What the library holds for the plugins about to be asked, one entry each.
///
/// Read before the plugins are, because the values go with the question
/// (`PluginSettingsParams.values`): a plugin is always asked with what the user
/// has filled in, so the answer can depend on it (baseline §14.7).
pub(crate) fn saved(
    repository: &Repository,
    plugins: &[String],
) -> Result<Vec<(String, Vec<PluginSetting>)>, AppError> {
    plugins
        .iter()
        .map(|plugin| Ok((plugin.clone(), repository.plugin_settings(plugin)?)))
        .collect()
}

/// Hands every plugin what the user filled in for it, once, at startup.
///
/// A body is resident and remembers what it was told, but a body that has just
/// started has been told nothing: without this, a plugin that works from a
/// video's menu would never see the user's settings at all, because the only
/// other moment the kernel hands them over is when the plugin page is open —
/// which is not where such a plugin is ever used.
///
/// **Only plugins that have something saved are asked.** A plugin the user has
/// never filled anything in for has nothing to be handed, and asking it anyway
/// would make every plugin that does not declare `plugin.settings` fail once per
/// start — five failures take a plugin out of the rotation, so the price of the
/// extra question would be the plugin itself.
pub(crate) fn hand_over(host: &PluginHost, repository: &Repository) -> Result<(), AppError> {
    let space = SpaceRef {
        id: repository.current_space()?.id,
    };
    for (plugin, values) in saved(repository, &host.enabled())? {
        if values.is_empty() {
            continue;
        }
        let _ = host.plugin_settings_for(&plugin, &space, &values);
    }
    Ok(())
}

/// One plugin's declaration, turned into what the page draws.
///
/// The values come from the library rather than from the plugin: a plugin says
/// what it wants filled in, and only the kernel knows what has been.
pub(crate) fn group(group: PluginSettings, saved: &[PluginSetting]) -> PluginSettingsGroup {
    PluginSettingsGroup {
        plugin: group.plugin,
        fields: group
            .fields
            .into_iter()
            .map(|field| PluginSettingField {
                value: saved
                    .iter()
                    .find(|setting| setting.key == field.key)
                    .map(|setting| setting.value.clone())
                    .unwrap_or_default(),
                key: field.key,
                kind: field.kind,
                label: field.label,
                required: field.required,
            })
            .collect(),
    }
}

/// Checks a filled-in form against the declaration it was drawn from, and
/// answers with what should be written.
///
/// What is written is exactly the declared fields, in the order the plugin
/// declared them. A value the user sent for a field the plugin no longer asks
/// about is dropped rather than refused: the declaration is the plugin's, it may
/// change between one read and the next, and a form that has gone stale is not
/// something the user did wrong.
///
/// Each of the four kinds has its own rule, because they are four different
/// questions and one answer for all of them would be a rule that says nothing:
///
/// - `text` and `textarea`: a required one may not be blank. Only the check
///   trims — what is kept is what the user typed, because the whitespace in a
///   multi-line value is theirs;
/// - `directory`: a required one may not be blank, and one that is not blank has
///   to be a directory that is there. What is kept is the path that was checked;
/// - `toggle`: never blank, so `required` has nothing to say about it. The value
///   is kept as `"true"` or `"false"`, because the kernel drew a two-valued
///   control and handing the plugin anything else would be handing it something
///   the kernel made up.
pub(crate) fn check(
    plugin: &str,
    fields: &[SettingField],
    submitted: &[SettingValue],
) -> Result<Vec<PluginSetting>, AppError> {
    let given: BTreeMap<&str, &str> = submitted
        .iter()
        .map(|value| (value.key.as_str(), value.value.as_str()))
        .collect();
    let mut kept = Vec::with_capacity(fields.len());
    for field in fields {
        let value = given.get(field.key.as_str()).copied().unwrap_or_default();
        let value = match field.kind {
            SettingFieldKind::Toggle => {
                if value == "true" {
                    "true"
                } else {
                    "false"
                }
            }
            SettingFieldKind::Directory if !value.trim().is_empty() => {
                let path = value.trim();
                if !Path::new(path).is_dir() {
                    return Err(AppError::new(
                        "plugin.settings.directory_missing",
                        format!("{path} is not a directory this machine has"),
                    )
                    .with_param("plugin", plugin)
                    .with_param("field", &field.key));
                }
                path
            }
            _ if field.required && value.trim().is_empty() => return Err(required(plugin, field)),
            _ => value,
        };
        kept.push(PluginSetting {
            key: field.key.clone(),
            value: value.to_string(),
        });
    }
    Ok(kept)
}

/// The one refusal that needs no explanation beyond the field it is about.
fn required(plugin: &str, field: &SettingField) -> AppError {
    AppError::new(
        "plugin.settings.required",
        format!("{} is required and was left blank", field.key),
    )
    .with_param("plugin", plugin)
    .with_param("field", &field.key)
}
