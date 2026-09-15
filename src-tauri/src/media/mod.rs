#[cfg(test)]
mod integration_tests;
mod tools;

use crate::process;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::error::AppError;

pub struct MediaProcessor {
    directory: Option<PathBuf>,
    cache: PathBuf,
}

impl MediaProcessor {
    pub fn for_app(app: &tauri::AppHandle, cache: PathBuf) -> Result<Self, AppError> {
        Ok(Self {
            directory: tools::directory(app)?,
            cache,
        })
    }

    #[cfg(test)]
    pub(crate) fn on_path(cache: PathBuf) -> Self {
        Self {
            directory: None,
            cache,
        }
    }
}

#[derive(Debug)]
pub struct Metadata {
    pub duration_ms: Option<i64>,
    pub width: i64,
    pub height: i64,
    pub codec: Option<String>,
}

#[derive(Deserialize)]
struct Probe {
    streams: Vec<Stream>,
    format: Option<Format>,
}

#[derive(Deserialize)]
struct Stream {
    width: Option<i64>,
    height: Option<i64>,
    codec_name: Option<String>,
    duration: Option<String>,
}

#[derive(Deserialize)]
struct Format {
    duration: Option<String>,
}

impl MediaProcessor {
    pub fn probe(&self, path: &Path, cancelled: impl Fn() -> bool) -> Result<Metadata, AppError> {
        let output = process::run(
            Command::new(tools::executable(self.directory.as_deref(), "ffprobe"))
                .args([
                    "-v",
                    "error",
                    "-select_streams",
                    "v:0",
                    "-show_streams",
                    "-show_format",
                    "-of",
                    "json",
                ])
                .arg(path),
            Duration::from_secs(30),
            cancelled,
        )?;
        if !output.status.success() {
            return Err(AppError::new(
                "media.metadata.failed",
                String::from_utf8_lossy(&output.stderr),
            ));
        }
        parse(&output.stdout)
    }
}

fn parse(bytes: &[u8]) -> Result<Metadata, AppError> {
    let probe: Probe = serde_json::from_slice(bytes)
        .map_err(|error| AppError::new("media.metadata.invalid", error))?;
    let stream = probe
        .streams
        .into_iter()
        .next()
        .ok_or_else(|| AppError::new("media.metadata.no_video", "No video stream"))?;
    let duration = probe
        .format
        .and_then(|format| format.duration)
        .or(stream.duration);
    let duration_ms = duration
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| value.is_finite() && *value >= 0.0)
        .map(|value| (value * 1000.0).round() as i64);
    let width = stream.width.filter(|value| *value > 0);
    let height = stream.height.filter(|value| *value > 0);
    match (width, height) {
        (Some(width), Some(height)) => Ok(Metadata {
            duration_ms,
            width,
            height,
            codec: stream.codec_name,
        }),
        _ => Err(AppError::new(
            "media.metadata.invalid",
            "Invalid video dimensions",
        )),
    }
}

impl MediaProcessor {
    pub fn thumbnail(
        &self,
        path: &Path,
        id: i64,
        modified: i64,
        cancelled: impl Fn() -> bool,
    ) -> Result<PathBuf, AppError> {
        let cache = &self.cache;
        std::fs::create_dir_all(cache)
            .map_err(|error| AppError::io(error, &cache.to_string_lossy()))?;
        let revision = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let destination = cache.join(format!("{id}-{modified}-{revision}.jpg"));
        let temporary = cache.join(format!("{id}-{modified}-{revision}.pending.jpg"));
        let output = process::run(
            Command::new(tools::executable(self.directory.as_deref(), "ffmpeg"))
                .args(["-nostdin", "-v", "error", "-y", "-i"])
                .arg(path)
                .args([
                    "-map",
                    "0:v:0",
                    "-frames:v",
                    "1",
                    "-vf",
                    "scale=480:-2",
                    "-q:v",
                    "3",
                ])
                .arg(&temporary),
            Duration::from_secs(60),
            cancelled,
        );
        let output = match output {
            Ok(output) => output,
            Err(error) => {
                let _ = std::fs::remove_file(&temporary);
                return Err(error);
            }
        };
        if !output.status.success() {
            let _ = std::fs::remove_file(&temporary);
            return Err(AppError::new(
                "media.thumbnail.failed",
                String::from_utf8_lossy(&output.stderr),
            ));
        }
        std::fs::rename(&temporary, &destination)
            .map_err(|error| AppError::io(error, &destination.to_string_lossy()))?;
        Ok(destination)
    }
}

#[cfg(test)]
mod tests {
    use super::parse;

    #[test]
    fn parses_fractional_duration_and_stream_dimensions() {
        let metadata = parse(br#"{"streams":[{"width":1920,"height":1080,"codec_name":"h264"}],"format":{"duration":"1.234"}}"#).unwrap();
        assert_eq!(metadata.duration_ms, Some(1234));
        assert_eq!((metadata.width, metadata.height), (1920, 1080));
        assert_eq!(metadata.codec.as_deref(), Some("h264"));
    }

    #[test]
    fn rejects_missing_video_and_handles_unknown_duration() {
        assert_eq!(
            parse(br#"{"streams":[]}"#).unwrap_err().code,
            "media.metadata.no_video"
        );
        assert!(
            parse(br#"{"streams":[{"width":16,"height":16,"duration":"N/A"}]}"#)
                .unwrap()
                .duration_ms
                .is_none()
        );
    }
}
