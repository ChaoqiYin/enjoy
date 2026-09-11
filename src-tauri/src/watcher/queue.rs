use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const QUIET_PERIOD: Duration = Duration::from_millis(500);
const MAX_DELAY: Duration = Duration::from_secs(2);

#[derive(Default)]
pub struct WatchQueue {
    pending: BTreeMap<PathBuf, (Instant, Instant)>,
}

impl WatchQueue {
    pub fn push(&mut self, path: PathBuf, now: Instant) {
        self.pending
            .entry(path)
            .and_modify(|entry| entry.1 = now)
            .or_insert((now, now));
    }

    pub fn remove(&mut self, path: &Path) {
        self.pending.remove(path);
    }

    pub fn retain(&mut self, directories: &BTreeSet<PathBuf>) {
        self.pending.retain(|path, _| directories.contains(path));
    }

    pub fn pop_ready(&mut self, now: Instant) -> Option<PathBuf> {
        let path = self
            .pending
            .iter()
            .filter(|(_, (first, last))| {
                now.duration_since(*last) >= QUIET_PERIOD || now.duration_since(*first) >= MAX_DELAY
            })
            .min_by_key(|(_, (first, _))| *first)
            .map(|(path, _)| path.clone())?;
        self.pending.remove(&path);
        Some(path)
    }
}

#[cfg(test)]
mod tests {
    use super::WatchQueue;
    use std::collections::BTreeSet;
    use std::path::PathBuf;
    use std::time::{Duration, Instant};

    #[test]
    fn continuous_changes_are_bounded_and_do_not_delay_other_directories() {
        let mut queue = WatchQueue::default();
        let start = Instant::now();
        let busy = PathBuf::from("busy");
        let quiet = PathBuf::from("quiet");
        queue.push(busy.clone(), start);
        queue.push(quiet.clone(), start);
        for step in 1..=5 {
            let now = start + Duration::from_millis(step * 400);
            queue.push(busy.clone(), now);
            match step {
                2 => assert_eq!(queue.pop_ready(now), Some(quiet.clone())),
                5 => assert_eq!(queue.pop_ready(now), Some(busy.clone())),
                _ => assert_eq!(queue.pop_ready(now), None),
            }
        }
    }

    #[test]
    fn oldest_directory_runs_first_and_removed_directories_are_discarded() {
        let mut queue = WatchQueue::default();
        let start = Instant::now();
        let older = PathBuf::from("z-older");
        let newer = PathBuf::from("a-newer");
        queue.push(older.clone(), start);
        queue.push(newer.clone(), start + Duration::from_millis(100));
        let now = start + Duration::from_secs(1);
        assert_eq!(queue.pop_ready(now), Some(older));
        queue.retain(&BTreeSet::new());
        assert_eq!(queue.pop_ready(now), None);
        queue.push(newer.clone(), now);
        queue.remove(&newer);
        assert_eq!(queue.pop_ready(now + Duration::from_secs(1)), None);
    }
}
