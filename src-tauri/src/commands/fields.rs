//! The fields a video's plugins have written, and the two errands that gather
//! them.
//!
//! Two commands, because the interface has two ways to want them: opening a
//! video's details asks what its fields are, and picking a plugin's item out of
//! a video's menu asks a plugin to go and find one first. The second is the
//! first with something done before it, so it is written as that rather than as
//! a second copy of the gathering — and the answer to both is the fields, which
//! is what the interface draws either way.
//!
//! Asking the plugins and reading the library are one call from the interface's
//! side, and splitting them would put the merge on the wrong side of the seam —
//! where the plugin order is not. This is the only place the chain's answer
//! reaches the library, and the only place the library's rows reach the plugins.
//! Both directions go through the shapes the catalog declares, so the two halves
//! of the plugin system are held together by the same file that describes them.

use crate::app::AppState;
use crate::error::AppError;
use crate::model::VideoField;
use crate::plugins::cover;
use crate::plugins::mount_points::{SpaceRef, VideoRef};
use crate::repository::lock_shared;
use tauri::State;

/// Asks the plugins what this video's fields are, stores what they answered, and
/// answers with what the library now holds.
///
/// Takes the state rather than a `State<AppState>` so that the rules here are
/// reachable from a test; the command below is the only production caller.
///
/// The record is resolved first and the lock is let go of before the plugins are
/// asked. Both halves of that are deliberate:
///
/// - resolved first, because a path this library does not hold is refused here
///   rather than becoming a plugin call about a record that does not exist;
/// - let go of, because a plugin is asked inside a command and the index is
///   shared with the scan and the media pass. Holding it across the call would
///   let a slow plugin stop a scan, which is exactly the "a plugin never blocks
///   the kernel" rule the host exists to keep (ADR 0043 §2).
///
/// The answer is the stored fields rather than the chain's answer, because that
/// is what the interface draws: the row is what the next panel reads, and a
/// value the library kept after its plugin went away has to be what comes back
/// out. A plugin that failed along the way said nothing, and a plugin that was
/// not asked said nothing either — neither is a reason for the call to fail.
///
/// Asynchronous for the sake of one field: a cover arrives as an address and the
/// kernel fetches it ([`cover::settle`]), which is a wait on somebody else's
/// server. A wait like that has no business on the thread the window talks to,
/// and the two locks are taken on either side of it rather than across it — the
/// record is resolved, the index is let go of, the plugins and the network are
/// waited on, and the index is taken again to write.
pub(crate) async fn refresh_fields(
    state: &AppState,
    space_id: i64,
    path: &str,
) -> Result<Vec<VideoField>, AppError> {
    let video_id = lock_shared(&state.repository)?.video_id(space_id, path)?;
    let answered = state.plugins.video_fields(
        &SpaceRef { id: space_id },
        &VideoRef {
            id: video_id,
            path: path.to_string(),
        },
    );
    // The catalog's shape and the library's row are the same three facts, and
    // the conversion is written out rather than derived from one to the other:
    // the catalog is generated, and a generated file is not where a decision
    // about what the library stores belongs.
    let mut fields: Vec<VideoField> = answered
        .into_iter()
        .map(|field| VideoField {
            key: field.key,
            value: field.value,
            source_plugin: field.source_plugin,
        })
        .collect();
    cover::settle(&state.covers, video_id, &mut fields).await;
    let mut repository = lock_shared(&state.repository)?;
    repository.save_fields(video_id, &fields)?;
    repository.fields(video_id)
}

/// Runs one plugin's own action on a video, then gathers the fields again.
///
/// The two are one command because they are one thing the user did: they picked
/// a plugin's item out of a video's menu to get that plugin to go and find
/// something, and what they expect to see afterwards is the video with it. A
/// caller that had to ask twice could draw the two answers contradicting each
/// other, and the interface would have to know that this action, alone among
/// them, is followed by a refresh.
///
/// The record is resolved before the plugin is asked, for the reason the refresh
/// gives: a path this library does not hold is refused here rather than becoming
/// a plugin call about a record that does not exist. A plugin the window is not
/// asking is not a failure either — the item was drawn from the manifest on
/// disk, and the disk is not what the running window asks.
pub(crate) async fn run_plugin_action(
    state: &AppState,
    space_id: i64,
    path: &str,
    plugin_id: &str,
) -> Result<Vec<VideoField>, AppError> {
    let video_id = lock_shared(&state.repository)?.video_id(space_id, path)?;
    state.plugins.video_action(
        plugin_id,
        &SpaceRef { id: space_id },
        &VideoRef {
            id: video_id,
            path: path.to_string(),
        },
    );
    refresh_fields(state, space_id, path).await
}

#[tauri::command]
pub(crate) async fn refresh_video_fields(
    space_id: i64,
    path: String,
    state: State<'_, AppState>,
) -> Result<Vec<VideoField>, AppError> {
    refresh_fields(&state, space_id, &path).await
}

#[tauri::command]
pub(crate) async fn run_video_action(
    space_id: i64,
    path: String,
    plugin_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<VideoField>, AppError> {
    run_plugin_action(&state, space_id, &path, &plugin_id).await
}
