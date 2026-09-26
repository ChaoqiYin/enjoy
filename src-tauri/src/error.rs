use serde::Serialize;
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub params: BTreeMap<String, String>,
    pub error_id: String,
}

impl AppError {
    pub fn new(code: &str, source: impl std::fmt::Display) -> Self {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let error_id = format!(
            "err_{timestamp}_{}",
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        );
        tracing::error!(error_id = %error_id, code, diagnostic = %source, "Application operation failed");
        Self {
            code: code.into(),
            params: BTreeMap::new(),
            error_id,
        }
    }

    /// Carries one value the message needs. It travels to the interface as it
    /// stands, so a rule stated in a number -- how long a name may be -- is
    /// written down once, where the rule is enforced, and only read out in the
    /// translation.
    pub fn with_param(mut self, key: &str, value: impl std::fmt::Display) -> Self {
        self.params.insert(key.into(), value.to_string());
        self
    }

    pub fn io(error: std::io::Error, path: &str) -> Self {
        let code = match error.kind() {
            std::io::ErrorKind::PermissionDenied => "media.scan.permission_denied",
            std::io::ErrorKind::NotFound => "media.file.not_found",
            _ => "media.filesystem.failed",
        };
        let mut result = Self::new(code, error);
        result.params.insert("path".into(), path.into());
        result
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(error: rusqlite::Error) -> Self {
        Self::new("media.database.failed", error)
    }
}
