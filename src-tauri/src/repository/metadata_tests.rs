use std::fs;

use crate::media::Metadata;
use crate::model::FileStamp;
use crate::repository::fixture::{Fixture, FIRST_SPACE};
use crate::repository::Repository;
use crate::scan::scanner;

#[test]
fn refresh_metadata_does_not_overwrite_a_concurrent_scan() {
    let fixture = Fixture::new();
    let movie = fixture.0.join("clip.mp4");
    fs::write(&movie, b"first").unwrap();
    let root = fixture.0.to_string_lossy().into_owned();
    let path = movie.to_string_lossy().into_owned();
    let mut repository = Repository::open(&fixture.0.join("index.db"), FIRST_SPACE).unwrap();
    let space = repository.current_space().unwrap().id;
    repository
        .replace_videos(
            space,
            &[(root.clone(), scanner::collect(&fixture.0).unwrap())],
        )
        .unwrap();
    let stale = repository.list(space).unwrap().remove(0);
    // A scan in the middle of the read below changes the same pair of fields
    // the write is guarded by: the write's lock and the identity verdict are
    // one and the same comparison now (ADR 0004), and growing the file is
    // enough to move it.
    fs::write(&movie, b"updated content").unwrap();
    repository
        .replace_videos(space, &[(root, scanner::collect(&fixture.0).unwrap())])
        .unwrap();
    let fresh = repository.list(space).unwrap().remove(0);
    assert_ne!(
        (stale.file_size, stale.modified_at),
        (fresh.file_size, fresh.modified_at)
    );
    let metadata = Metadata {
        duration_ms: Some(500),
        width: 640,
        height: 360,
        codec: Some("h264".into()),
    };
    let written = repository
        .refresh_metadata(
            space,
            &path,
            FileStamp {
                file_size: stale.file_size,
                modified_at: stale.modified_at,
            },
            FileStamp {
                file_size: 999,
                modified_at: 999,
            },
            &metadata,
        )
        .unwrap();
    assert!(!written);
    let after = repository.list(space).unwrap().remove(0);
    assert_eq!(after.file_size, fresh.file_size);
    assert_eq!(after.modified_at, fresh.modified_at);
    assert!(after.width.is_none());
    assert!(after.duration_ms.is_none());
}

#[test]
fn refresh_metadata_marks_media_complete_after_success() {
    let fixture = Fixture::new();
    let movie = fixture.0.join("clip.mp4");
    fs::write(&movie, b"video").unwrap();
    let root = fixture.0.to_string_lossy().into_owned();
    let path = movie.to_string_lossy().into_owned();
    let mut repository = Repository::open(&fixture.0.join("index.db"), FIRST_SPACE).unwrap();
    let space = repository.current_space().unwrap().id;
    repository
        .replace_videos(space, &[(root, scanner::collect(&fixture.0).unwrap())])
        .unwrap();
    let video = repository.list(space).unwrap().remove(0);
    assert!(!video.media_complete);
    repository
        .save_thumbnail(space, &video, "cached.jpg")
        .unwrap();
    let video = repository.list(space).unwrap().remove(0);
    assert!(!video.media_complete);
    let metadata = Metadata {
        duration_ms: Some(500),
        width: 160,
        height: 90,
        codec: Some("mpeg4".into()),
    };
    let written = repository
        .refresh_metadata(
            space,
            &path,
            FileStamp {
                file_size: video.file_size,
                modified_at: video.modified_at,
            },
            FileStamp {
                file_size: video.file_size,
                modified_at: video.modified_at,
            },
            &metadata,
        )
        .unwrap();
    assert!(written);
    let after = repository.list(space).unwrap().remove(0);
    assert!(after.media_complete);
    assert_eq!(after.width, Some(160));
    assert_eq!(after.height, Some(90));
    assert_eq!(after.duration_ms, Some(500));
    assert_eq!(after.codec.as_deref(), Some("mpeg4"));
    assert_eq!(after.thumbnail_path.as_deref(), Some("cached.jpg"));
}

#[test]
fn refresh_metadata_only_updates_the_target_file_without_thumbnail() {
    let fixture = Fixture::new();
    let movie = fixture.0.join("clip.mp4");
    let other = fixture.0.join("other.mkv");
    fs::write(&movie, b"video").unwrap();
    fs::write(&other, b"video").unwrap();
    let root = fixture.0.to_string_lossy().into_owned();
    let path = movie.to_string_lossy().into_owned();
    let mut repository = Repository::open(&fixture.0.join("index.db"), FIRST_SPACE).unwrap();
    let space = repository.current_space().unwrap().id;
    repository
        .replace_videos(space, &[(root, scanner::collect(&fixture.0).unwrap())])
        .unwrap();
    let videos = repository.list(space).unwrap();
    let target = videos.iter().find(|video| video.path == path).unwrap();
    let other_before = videos.iter().find(|video| video.path != path).unwrap();
    let target_size = target.file_size;
    let target_modified = target.modified_at;
    let other_id = other_before.id;
    let other_size = other_before.file_size;
    let other_width = other_before.width;
    let other_codec = other_before.codec.clone();
    let other_thumbnail = other_before.thumbnail_path.clone();
    let metadata = Metadata {
        duration_ms: Some(500),
        width: 160,
        height: 90,
        codec: Some("mpeg4".into()),
    };
    let written = repository
        .refresh_metadata(
            space,
            &path,
            FileStamp {
                file_size: target_size,
                modified_at: target_modified,
            },
            FileStamp {
                file_size: target_size,
                modified_at: target_modified,
            },
            &metadata,
        )
        .unwrap();
    assert!(written);
    let rows = repository.list(space).unwrap();
    let after = rows.iter().find(|video| video.path == path).unwrap();
    assert!(!after.media_complete);
    assert_eq!(after.thumbnail_path, None);
    assert_eq!(after.width, Some(160));
    let other_after = rows.iter().find(|video| video.id == other_id).unwrap();
    assert_eq!(other_after.file_size, other_size);
    assert_eq!(other_after.width, other_width);
    assert_eq!(other_after.codec.as_deref(), other_codec.as_deref());
    assert_eq!(
        other_after.thumbnail_path.as_deref(),
        other_thumbnail.as_deref()
    );
    assert!(!other_after.media_complete);
}
