use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use super::relevant;
use crate::repository::Repository;
use crate::scanner;

struct Fixture(PathBuf);

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn receive_change(receiver: &Receiver<notify::Result<Event>>, path: &Path) {
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        let event = receiver
            .recv_timeout(remaining)
            .expect("Filesystem notification deadline exceeded")
            .expect("Filesystem watcher failed");
        if relevant(&event)
            && event
                .paths
                .iter()
                .any(|changed| changed == path || path.starts_with(changed))
        {
            return;
        }
    }
}

#[test]
fn real_notifications_refresh_created_renamed_and_deleted_videos() {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let fixture =
        Fixture(std::env::temp_dir().join(format!("enjoy-watch-{}-{unique}", std::process::id())));
    fs::create_dir_all(&fixture.0).unwrap();
    let root = fs::canonicalize(&fixture.0).unwrap();
    let (sender, receiver) = mpsc::channel();
    let mut watcher = RecommendedWatcher::new(sender, notify::Config::default()).unwrap();
    watcher.watch(&root, RecursiveMode::Recursive).unwrap();
    let mut repository = Repository::open(&root.join("index.db")).unwrap();
    let root_text = root.to_str().unwrap();
    repository.index(root_text, &[]).unwrap();
    let original = root.join("original.mp4");
    fs::write(&original, b"sample").unwrap();
    receive_change(&receiver, &original);
    repository
        .index(root_text, &scanner::collect(&root).unwrap())
        .unwrap();
    let first = repository.list().unwrap().remove(0);
    assert!(first.available);
    repository
        .favorite(original.to_str().unwrap(), true)
        .unwrap();
    let moved = root.join("renamed.mp4");
    fs::rename(&original, &moved).unwrap();
    receive_change(&receiver, &moved);
    repository
        .index(root_text, &scanner::collect(&root).unwrap())
        .unwrap();
    let videos = repository.list().unwrap();
    assert!(videos
        .iter()
        .any(|video| video.id == first.id && !video.available && video.favorite));
    assert!(videos
        .iter()
        .any(|video| video.path == moved.to_string_lossy() && video.available));
    fs::remove_file(&moved).unwrap();
    receive_change(&receiver, &moved);
    repository
        .index(root_text, &scanner::collect(&root).unwrap())
        .unwrap();
    assert!(repository
        .list()
        .unwrap()
        .iter()
        .all(|video| !video.available));
    watcher.unwatch(&root).unwrap();
}
