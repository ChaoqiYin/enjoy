//! The fields a video's plugins have written, and the refresh that gathers
//! them.
//!
//! One command, because the two halves of the question are one errand: the
//! interface opens a video's details, and what it wants is the fields that
//! video has. Asking the plugins and reading the library are the same call from
//! there, and splitting them would put the merge on the interface's side of the
//! seam — where the plugin order is not.
//!
//! This is the only place the chain's answer reaches the library, and it is the
//! only place the library's rows reach the plugins. Both directions go through
//! the shapes the catalog declares, so the two halves of the plugin system are
//! held together by the same file that describes them.

use crate::app::AppState;
use crate::error::AppError;
use crate::model::VideoField;
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
pub(crate) fn refresh_fields(
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
    let fields: Vec<VideoField> = answered
        .into_iter()
        .map(|field| VideoField {
            key: field.key,
            value: field.value,
            source_plugin: field.source_plugin,
        })
        .collect();
    let mut repository = lock_shared(&state.repository)?;
    repository.save_fields(video_id, &fields)?;
    repository.fields(video_id)
}

#[tauri::command]
pub(crate) fn refresh_video_fields(
    space_id: i64,
    path: String,
    state: State<'_, AppState>,
) -> Result<Vec<VideoField>, AppError> {
    refresh_fields(&state, space_id, &path)
}
