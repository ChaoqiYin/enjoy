//! The mount points the kernel asks a plugin's body at, one method each.
//!
//! One method per mount point rather than a generic `mount(key, payload)`, for
//! the reason `events.rs` gives for one method per event: the params and the
//! result of each mount point are declared in the catalog, and a keyed entry
//! would erase those types at exactly the seam the kernel calls in — a mount
//! point that is not there, or a params shape that drifted, would stop being a
//! compile error and become a call that quietly does nothing.
//!
//! The four here are the body's. `app.page` and `video.panel` belong to the
//! plugin interface and are dispatched in the interface, where the thing being
//! asked is a page rather than a body.
//!
//! Every method answers, and none of them returns an error: that is the shape
//! of "a plugin can only add" (ADR 0043 §2). A caller gets contributions, never
//! a refusal — so no kernel flow can be stopped by a plugin, whatever it does.

use std::sync::Arc;
use std::time::Instant;

use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::error::AppError;
use crate::model::PluginSetting;
use crate::plugins::metrics::CallOutcome;
use crate::plugins::mount_points::{
    self, FieldValue, PluginSettingsParams, PluginSettingsResult, ScanCompletedParams,
    ScanCompletedResult, SettingField, SettingValue, SourcedFieldValue, SpaceRef,
    VideoActionsParams, VideoActionsResult, VideoFieldsParams, VideoFieldsResult, VideoRef,
};
use crate::plugins::runner::{Runner, RunnerError};
use crate::plugins::PluginHost;

/// What one plugin says the user has to fill in.
///
/// Grouped by the plugin that gave it, because the kernel draws one group per
/// plugin and has to be able to say whose settings these are.
#[derive(Debug, Clone)]
pub(crate) struct PluginSettings {
    pub plugin: String,
    pub fields: Vec<SettingField>,
}

/// What one plugin has been filled in with, out of the library's rows.
///
/// The rows arrive as one list for every plugin being asked, because that is how
/// they are read; picking one plugin's out of it is this call, written once
/// rather than at each of the three places that need it — the question here, the
/// grouping beside it, and the page the command draws.
pub(crate) fn saved_for<'a>(
    saved: &'a [(String, Vec<PluginSetting>)],
    plugin: &str,
) -> &'a [PluginSetting] {
    saved
        .iter()
        .find(|(asked, _)| asked == plugin)
        .map(|(_, values)| values.as_slice())
        .unwrap_or(&[])
}

impl PluginHost {
    /// `video.fields`: asks each plugin in turn for this video's named fields,
    /// and keeps the first non-empty value for each key.
    ///
    /// Each plugin is handed the values the chain already has, with the plugin
    /// that gave each one, so the one after it fills a gap rather than asking
    /// the same question again (ADR 0045 §3). An empty answer is not an answer:
    /// a plugin that looked and found nothing leaves the field for the next one
    /// instead of holding it.
    pub(crate) fn video_fields(
        &self,
        space: &SpaceRef,
        video: &VideoRef,
    ) -> Vec<SourcedFieldValue> {
        let mut answered: Vec<SourcedFieldValue> = Vec::new();
        for (plugin, body) in self.asking() {
            let params = VideoFieldsParams {
                space: space.clone(),
                video: video.clone(),
                fields: answered.clone(),
            };
            let Some(answer) =
                self.ask::<VideoFieldsResult>(&plugin, &body, mount_points::VIDEO_FIELDS, &params)
            else {
                continue;
            };
            for FieldValue { key, value } in answer.fields {
                if value.is_empty() || answered.iter().any(|already| already.key == key) {
                    continue;
                }
                answered.push(SourcedFieldValue {
                    key,
                    value,
                    source_plugin: plugin.clone(),
                });
            }
        }
        answered
    }

    /// `plugin.settings`: what each plugin needs the user to fill in, asked with
    /// what the user has already filled in.
    ///
    /// A plugin that needs nothing filled in gets no group rather than an empty
    /// one: the kernel draws one section per group, and a section with a
    /// plugin's name and nothing under it is a section that says nothing.
    ///
    /// `saved` is what the library holds for the plugins being asked, one entry
    /// per plugin. It travels **with the question** rather than being pushed at
    /// a plugin when it changes: a body is resident and remembers what it was
    /// told, but remembering is not having been told. The first time a plugin is
    /// asked it has nothing, and a plugin switched on after the user filled the
    /// form in never saw the values arrive — so every question carries them, and
    /// a plugin has one way to get them rather than two (baseline §14.8).
    pub(crate) fn plugin_settings(
        &self,
        space: &SpaceRef,
        saved: &[(String, Vec<PluginSetting>)],
    ) -> Vec<PluginSettings> {
        self.asking()
            .into_iter()
            .filter_map(|(plugin, body)| {
                let fields = self.ask_settings(&plugin, &body, space, saved_for(saved, &plugin))?;
                if fields.is_empty() {
                    return None;
                }
                Some(PluginSettings { plugin, fields })
            })
            .collect()
    }

    /// `plugin.settings`, asked of one named plugin.
    ///
    /// One plugin rather than all of them, for the startup hand-over: what that
    /// needs is to give a plugin the values the user filled in for it, and the
    /// only way to give a plugin anything is to ask it something. A plugin the
    /// host is not asking answers nothing, which is not a failure — the reason
    /// [`PluginHost::video_action`] gives.
    pub(crate) fn plugin_settings_for(
        &self,
        plugin: &str,
        space: &SpaceRef,
        values: &[PluginSetting],
    ) -> Option<Vec<SettingField>> {
        let body = self.asking_one(plugin)?;
        self.ask_settings(plugin, &body, space, values)
    }

    /// One plugin's declaration, asked with the values it has been handed.
    ///
    /// The two callers above differ only in which plugins they ask and in what
    /// they do with the answer, so the question itself is written once.
    fn ask_settings(
        &self,
        plugin: &str,
        body: &Arc<dyn Runner>,
        space: &SpaceRef,
        values: &[PluginSetting],
    ) -> Option<Vec<SettingField>> {
        let params = PluginSettingsParams {
            space: space.clone(),
            values: values
                .iter()
                .map(|setting| SettingValue {
                    key: setting.key.clone(),
                    value: setting.value.clone(),
                })
                .collect(),
        };
        self.ask::<PluginSettingsResult>(plugin, body, mount_points::PLUGIN_SETTINGS, &params)
            .map(|answer| answer.fields)
    }

    /// `scan.completed`: tells every plugin what a scan just took in.
    ///
    /// A notification, not a question: what a plugin does about it lands in its
    /// own data directory, and nothing comes back (the catalog's result for
    /// this mount point is empty).
    pub(crate) fn scan_completed(&self, space: &SpaceRef, videos: &[VideoRef]) {
        let params = ScanCompletedParams {
            space: space.clone(),
            videos: videos.to_vec(),
        };
        self.announce::<ScanCompletedResult>(mount_points::SCAN_COMPLETED, &params);
    }

    /// `video.actions`: asks **one** plugin to do the thing its own menu item
    /// says.
    ///
    /// One plugin, not every plugin, and that is what the catalog's wording is:
    /// a contribution at this mount point is *a plugin's own action* on a video,
    /// so one manifest is one menu item and choosing an item is a question put
    /// to the plugin that put it there. Telling every plugin that somebody
    /// clicked something would be a broadcast, and a plugin that reacted to it
    /// would be doing work on behalf of a menu item it never offered.
    ///
    /// It belongs to the body rather than to the interface because a plugin with
    /// no interface has only this way to be reached (ADR 0045 §2): the cover
    /// plugin has no page and is used from the menu on a video.
    ///
    /// A plugin the host is not asking — switched off, never enabled, or out of
    /// the rotation after five failures — is not a failure of this call: the
    /// item was drawn from the manifest on disk, and the disk is not what the
    /// running window asks.
    pub(crate) fn video_action(&self, plugin: &str, space: &SpaceRef, video: &VideoRef) {
        let Some(body) = self.asking_one(plugin) else {
            return;
        };
        let params = VideoActionsParams {
            space: space.clone(),
            video: video.clone(),
        };
        let _ = self.ask::<VideoActionsResult>(plugin, &body, mount_points::VIDEO_ACTIONS, &params);
    }

    /// Tells every plugin something, in order, and keeps nothing.
    fn announce<R: DeserializeOwned>(&self, mount_point: &'static str, params: &impl Serialize) {
        for (plugin, body) in self.asking() {
            let _ = self.ask::<R>(&plugin, &body, mount_point, params);
        }
    }

    /// Asks one plugin one question and hands back what it said, or `None`.
    ///
    /// `None` is the whole of the kernel's policy about a plugin that failed:
    /// this call is over, the plugin said nothing, and whoever asked goes on as
    /// though it had been asked and had nothing to add (ADR 0043 §5). What
    /// happens on the way there is the same for every mount point — the call is
    /// timed, a failure is written down, the user is told once, and the count
    /// that can take the plugin out of the rotation goes up — so it is written
    /// once, here, rather than at each of the four call sites.
    fn ask<T: DeserializeOwned>(
        &self,
        plugin: &str,
        body: &Arc<dyn Runner>,
        mount_point: &'static str,
        params: &impl Serialize,
    ) -> Option<T> {
        // Params the kernel cannot write are a fault of the kernel's own
        // catalog, not of the plugin, so they are not counted against it. The
        // call still says nothing, which is the answer either way.
        let payload = serde_json::to_string(params).ok()?;
        let started = Instant::now();
        let answer = body.handle(mount_point, &payload);
        let elapsed = started.elapsed();
        match answer {
            Ok(json) => match serde_json::from_str::<T>(&json) {
                Ok(answer) => {
                    self.write_down(plugin, mount_point, CallOutcome::Answered, elapsed);
                    Some(answer)
                }
                Err(error) => {
                    self.broke(plugin, mount_point, CallOutcome::Failed, elapsed, error);
                    None
                }
            },
            Err(RunnerError::Failed(reason)) => {
                self.broke(plugin, mount_point, CallOutcome::Failed, elapsed, reason);
                None
            }
            Err(RunnerError::TimedOut) => {
                self.broke(
                    plugin,
                    mount_point,
                    CallOutcome::TimedOut,
                    elapsed,
                    // "Given up on" rather than "interrupted": one of the three
                    // deadlines behind this ends the call while the plugin's own
                    // thread may still be busy (`RunnerError::TimedOut`).
                    "The plugin ran past its deadline and the call was given up on",
                );
                None
            }
        }
    }

    /// One call that did not come back with an answer.
    ///
    /// The three things the kernel owes, in one place: the user is told once,
    /// by name and mount point; the call is written down; and the count that
    /// takes a plugin that keeps doing this out of the rotation goes up.
    fn broke(
        &self,
        plugin: &str,
        mount_point: &'static str,
        outcome: CallOutcome,
        elapsed: std::time::Duration,
        why: impl std::fmt::Display,
    ) {
        // Only the two failures reach here. Which one it was is worth telling
        // apart: "this plugin is broken" and "this plugin was given up on for
        // taking too long" are different things to do something about.
        let code = match outcome {
            CallOutcome::TimedOut => "plugin.call.timed_out",
            _ => "plugin.call.failed",
        };
        let error = AppError::new(code, why)
            .with_param("plugin", plugin)
            .with_param("mountPoint", mount_point);
        self.events.plugin_failed(&error);
        self.write_down(plugin, mount_point, outcome, elapsed);
        self.registry().failed(plugin);
    }
}
