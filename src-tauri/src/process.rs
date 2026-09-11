use std::io::Read;
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use crate::error::AppError;

pub fn run(
    command: &mut Command,
    timeout: Duration,
    cancelled: impl Fn() -> bool,
) -> Result<Output, AppError> {
    let tool = command.get_program().to_string_lossy().into_owned();
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            let code = if error.kind() == std::io::ErrorKind::NotFound {
                "media.tool.not_found"
            } else {
                "media.tool.failed"
            };
            let mut failure = AppError::new(code, error);
            failure.params.insert("tool".into(), tool.clone());
            failure
        })?;
    let stdout = child.stdout.take().expect("stdout pipe configured");
    let stderr = child.stderr.take().expect("stderr pipe configured");
    let stdout = thread::spawn(move || drain(stdout));
    let stderr = thread::spawn(move || drain(stderr));
    let started = Instant::now();
    let result = loop {
        if cancelled() {
            break Err(AppError::new(
                "media.scan.cancelled",
                "Media processing cancelled",
            ));
        }
        if started.elapsed() >= timeout {
            break Err(AppError::new(
                "media.tool.timeout",
                "Media tool exceeded time limit",
            ));
        }
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => thread::sleep(Duration::from_millis(25)),
            Err(error) => break Err(AppError::new("media.tool.failed", error)),
        }
    };
    if result.is_err() {
        let _ = child.kill();
        let _ = child.wait();
    }
    let stdout = stdout
        .join()
        .map_err(|_| AppError::new("media.tool.failed", "Output reader panicked"))?;
    let stderr = stderr
        .join()
        .map_err(|_| AppError::new("media.tool.failed", "Error reader panicked"))?;
    Ok(Output {
        status: result?,
        stdout: stdout.map_err(|error| AppError::new("media.tool.failed", error))?,
        stderr: stderr.map_err(|error| AppError::new("media.tool.failed", error))?,
    })
}

fn drain(mut reader: impl Read) -> std::io::Result<Vec<u8>> {
    let mut output = Vec::new();
    let mut buffer = [0; 8192];
    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            return Ok(output);
        }
        let retained = count.min((1024 * 1024_usize).saturating_sub(output.len()));
        output.extend_from_slice(&buffer[..retained]);
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::run;
    use std::process::Command;
    use std::time::{Duration, Instant};

    #[test]
    fn timeout_and_cancel_terminate_the_child() {
        let start = Instant::now();
        let error = run(
            Command::new("sleep").arg("30"),
            Duration::from_millis(60),
            || false,
        )
        .unwrap_err();
        assert_eq!(error.code, "media.tool.timeout");
        assert!(start.elapsed() < Duration::from_secs(2));
        let error = run(
            Command::new("sleep").arg("30"),
            Duration::from_secs(30),
            || true,
        )
        .unwrap_err();
        assert_eq!(error.code, "media.scan.cancelled");
    }

    #[test]
    fn captures_output_and_exit_status() {
        let output = run(
            Command::new("printf").arg("sample"),
            Duration::from_secs(2),
            || false,
        )
        .unwrap();
        assert!(output.status.success());
        assert_eq!(output.stdout, b"sample");
    }
}
