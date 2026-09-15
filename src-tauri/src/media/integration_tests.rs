use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::{Arc, Mutex};

use crate::media;
use crate::repository::Repository;
use crate::scan::control::ScanControl;
use crate::scan::job as scan_job;

#[test]
#[ignore = "Requires ffmpeg and ffprobe on PATH"]
fn real_tools_extract_metadata_and_create_thumbnail() {
    let directory = std::env::temp_dir().join(format!("enjoy-media-test-{}", std::process::id()));
    fs::create_dir_all(&directory).unwrap();
    let video = directory.join("sample with spaces.mp4");
    let status = Command::new("ffmpeg")
        .args([
            "-nostdin",
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=160x90:d=0.5",
            "-c:v",
            "mpeg4",
        ])
        .arg(&video)
        .status()
        .unwrap();
    assert!(status.success());
    let media = media::MediaProcessor::on_path(directory.join("cache"));
    let metadata = media.probe(&video, || false).unwrap();
    assert_eq!((metadata.width, metadata.height), (160, 90));
    assert!(metadata.duration_ms.unwrap() >= 400);
    let thumbnail = media.thumbnail(&video, 1, 1, || false).unwrap();
    let bytes = fs::read(&thumbnail).unwrap();
    assert!(bytes.starts_with(&[0xff, 0xd8]));
    assert!(bytes.len() > 100);
    fs::write(directory.join("broken.mp4"), b"invalid video").unwrap();
    assert_eq!(
        media
            .probe(&directory.join("broken.mp4"), || false)
            .unwrap_err()
            .code,
        "media.metadata.failed"
    );
    verify_scan_failure_counts_and_cache(&directory);
    verify_cancelled_metadata_resumes(&directory, &video);
    fs::remove_dir_all(directory).unwrap();
}

fn verify_scan_failure_counts_and_cache(directory: &Path) {
    let repository = Arc::new(Mutex::new(
        Repository::open(&directory.join("index.db")).unwrap(),
    ));
    let control = Arc::new(ScanControl::default());
    let cache = directory.join("scan-cache");
    let media = media::MediaProcessor::on_path(cache);
    let mut previous_thumbnail = None;
    for attempt in 0..2 {
        let guard = control.begin().unwrap();
        let mut errors = Vec::new();
        let mut events = Vec::new();
        let videos = scan_job::run(
            &[directory.to_string_lossy().into_owned()],
            &media,
            &repository,
            &control,
            false,
            |status| events.push(status),
            |error| errors.push(error.code),
        )
        .unwrap();
        drop(guard);
        let status = control.status();
        assert_eq!(status.phase, "complete");
        assert_eq!(
            (status.discovered, status.indexed, status.processed),
            (2, 2, 2)
        );
        assert_eq!((status.metadata_ready, status.thumbnails_ready), (1, 1));
        assert_eq!(status.failures, 2);
        assert!(errors.contains(&"media.metadata.failed".to_owned()));
        assert!(errors.contains(&"media.thumbnail.failed".to_owned()));
        assert!(status.current_path.is_empty());
        assert_eq!(status.changes.added, if attempt == 0 { 2 } else { 0 });
        let good = videos
            .iter()
            .find(|video| video.file_name.starts_with("sample"))
            .unwrap();
        let broken = videos
            .iter()
            .find(|video| video.file_name == "broken.mp4")
            .unwrap();
        assert!(good.width.is_some() && good.thumbnail_path.is_some());
        assert!(broken.width.is_none() && broken.thumbnail_path.is_none());
        let thumbnail = good.thumbnail_path.clone().unwrap();
        assert!(fs::metadata(&thumbnail).unwrap().len() > 0);
        assert_eq!(
            events.iter().any(|event| event.current_path == good.path),
            attempt == 0
        );
        assert!(good.media_complete);
        assert!(!broken.media_complete);
        if let Some(previous) = previous_thumbnail {
            assert_eq!(previous, thumbnail);
        }
        previous_thumbnail = Some(thumbnail);
        assert!(events.iter().any(|event| event.current_path == broken.path));
        assert!(events
            .iter()
            .all(|event| event.metadata_ready <= 1 && event.thumbnails_ready <= 1));
    }
}

fn verify_cancelled_metadata_resumes(parent: &Path, source: &Path) {
    let directory = parent.join("resume");
    fs::create_dir_all(&directory).unwrap();
    fs::copy(source, directory.join("movie.mp4")).unwrap();
    let db = directory.join("library.db");
    let repository = Arc::new(Mutex::new(Repository::open(&db).unwrap()));
    let control = Arc::new(ScanControl::default());
    let media = media::MediaProcessor::on_path(directory.join("cache"));
    let paths = [directory.to_string_lossy().into_owned()];
    let guard = control.begin().unwrap();
    let result = scan_job::run(
        &paths,
        &media,
        &repository,
        &control,
        false,
        |status| {
            if status.metadata_ready == 1 {
                control.action("cancel").unwrap();
            }
        },
        |error| panic!("Unexpected media error: {}", error.code),
    );
    assert_eq!(result.unwrap_err().code, "media.scan.cancelled");
    drop(guard);
    let partial = repository.lock().unwrap().list().unwrap().remove(0);
    assert!(partial.width.is_some());
    assert!(partial.thumbnail_path.is_none());
    assert!(!partial.media_complete);
    drop(repository);
    let repository = Arc::new(Mutex::new(Repository::open(&db).unwrap()));
    let guard = control.begin().unwrap();
    let rows = scan_job::run(
        &paths,
        &media,
        &repository,
        &control,
        false,
        |_| {},
        |error| panic!("Unexpected media error: {}", error.code),
    )
    .unwrap();
    drop(guard);
    assert!(rows[0].media_complete);
    assert!(Path::new(rows[0].thumbnail_path.as_ref().unwrap()).exists());
    assert_eq!(rows[0].width, partial.width);
}
