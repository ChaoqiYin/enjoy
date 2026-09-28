//! The slot the 共享服务 occupies: whether one is running, starting one, ending
//! one.
//!
//! One at a time, and only when the user asks. Nothing else in the application
//! opens the port, and no failure here leaves one open: a service that could not
//! start reports why, and the slot goes back to holding nothing.

use serde::Serialize;
use std::sync::{Mutex, MutexGuard};

use crate::error::AppError;

use super::service::Service;

/// What the interface is told about the service.
///
/// The port is the whole of the first fact: whether the service is running *is*
/// whether there is a port, and a flag beside a port would be two answers to one
/// question with nothing keeping them in step. What a reader wants to know — may
/// I offer a connected device an address — is answered by the same field.
///
/// `missing_files` is the second fact, and it is about the list rather than the
/// service: the videos the user picked that could not be offered because their
/// file is not on disk any more. It is counted when the service starts, because
/// that is when the list is read, and it is zero when nothing is running.
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareStatus {
    pub port: Option<u16>,
    pub missing_files: usize,
}

#[derive(Default)]
pub struct ShareControl {
    running: Mutex<Option<Service>>,
}

impl ShareControl {
    /// The slot, taken the way every method here takes it: a poisoned lock is
    /// one a panicking thread left behind, and what it left behind is still the
    /// state.
    fn lock(&self) -> MutexGuard<'_, Option<Service>> {
        self.running
            .lock()
            .unwrap_or_else(|error| error.into_inner())
    }

    /// What is running right now.
    ///
    /// Answered without starting anything, because the question is asked from
    /// every page: the navigation entry carries an indicator for a service the
    /// user may have started on another one, and a status that had to open a port
    /// to be read would turn looking at the interface into starting a service.
    pub fn status(&self) -> ShareStatus {
        match self.lock().as_ref() {
            Some(service) => ShareStatus {
                port: Some(service.port()),
                missing_files: service.missing(),
            },
            None => ShareStatus::default(),
        }
    }

    /// Starts the service over one space's 共享清单, or says why it could not
    /// start.
    ///
    /// `requested` is the port to take, or `None` to let the operating system
    /// choose one. `language` is the language the landing page is written in:
    /// the person who opened the address is the one who started the service, and
    /// they are reading the application in this language right now. `paths` is
    /// the list itself, read by the caller — this layer knows about ports and
    /// threads, and nothing about where a library is kept.
    pub fn open(
        &self,
        requested: Option<u16>,
        language: &str,
        paths: &[String],
    ) -> Result<ShareStatus, AppError> {
        let mut slot = self.lock();
        if slot.is_some() {
            return Err(AppError::new(
                "share.already_running",
                "The share service is already running",
            ));
        }
        // Started while the slot is held, so two callers cannot both find it
        // empty and both bind. The bind itself happens inside, before the thread
        // is spawned, which is what lets a port that cannot be taken be reported
        // to this caller instead of to nobody.
        let service = Service::start(requested, language, paths)?;
        let status = ShareStatus {
            port: Some(service.port()),
            missing_files: service.missing(),
        };
        *slot = Some(service);
        Ok(status)
    }

    /// Ends the service. Returns once it has ended and the port is free again.
    ///
    /// The slot is emptied before the service is ended, so that the lock is not
    /// held across the join: ending is the one operation here that waits on
    /// something else, and holding the slot's lock while it does would make the
    /// status unreadable for exactly as long as the interface is being told the
    /// service stopped.
    pub fn close(&self) -> ShareStatus {
        let service = self.lock().take();
        if let Some(service) = service {
            service.end();
        }
        ShareStatus::default()
    }
}

#[cfg(test)]
mod tests {
    use super::ShareControl;
    use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
    use std::time::Duration;

    /// Everything, on every interface, which is where the service listens.
    fn anywhere(port: u16) -> SocketAddr {
        SocketAddr::from((Ipv4Addr::UNSPECIFIED, port))
    }

    /// A port nothing holds, taken from the system and then given back. Handing
    /// a test a port number the system chose a moment ago is the only way to
    /// name a port in advance without also owning it.
    fn a_port_nothing_holds() -> u16 {
        let listener = TcpListener::bind(anywhere(0)).unwrap();
        listener.local_addr().unwrap().port()
    }

    /// Whether anything answers on this port.
    ///
    /// Asked by connecting rather than by binding, because binding is not the
    /// same question everywhere: on Windows a bind to one address succeeds while
    /// another socket holds the wildcard for that port, so a listener that
    /// probes by binding would report a port free while the service was using
    /// it. A connection is answered by whoever is listening, on every platform.
    fn listening(port: u16) -> bool {
        TcpStream::connect_timeout(
            &SocketAddr::from((Ipv4Addr::LOCALHOST, port)),
            Duration::from_millis(500),
        )
        .is_ok()
    }

    #[test]
    fn the_status_answers_without_starting_anything() {
        let control = ShareControl::default();
        assert_eq!(control.status().port, None);
        let port = a_port_nothing_holds();
        // Reading the status started nothing: asking twice did not open
        // anything, and the port the status would have taken is still quiet.
        assert_eq!(control.status().port, None);
        assert!(!listening(port));
    }

    #[test]
    fn a_service_starts_ends_and_leaves_the_port_behind_it_free() {
        let control = ShareControl::default();
        let started = control.open(None, "en", &[]).unwrap();
        let port = started.port.expect("a service that started has a port");
        assert_eq!(control.status().port, Some(port));
        assert!(listening(port));

        assert_eq!(control.close().port, None);
        assert_eq!(control.status().port, None);
        // The port comes back because the thread serving it has ended by the
        // time `close` returns, not at some later point nobody waited for. This
        // is the assertion the whole thread-and-runtime arrangement is for.
        assert!(!listening(port));
    }

    #[test]
    fn the_same_port_can_be_taken_again_after_ending_and_taking_it() {
        let control = ShareControl::default();
        // A port the test names, so that the second start is known to be
        // reaching for the same one rather than for whatever the system offers.
        let requested = a_port_nothing_holds();
        assert_eq!(
            control.open(Some(requested), "en", &[]).unwrap().port,
            Some(requested)
        );
        control.close();
        assert_eq!(
            control.open(Some(requested), "en", &[]).unwrap().port,
            Some(requested)
        );
        control.close();
    }

    #[test]
    fn a_second_service_is_refused_while_one_is_running() {
        let control = ShareControl::default();
        let running = control.open(None, "en", &[]).unwrap();
        let refused = control.open(None, "en", &[]).unwrap_err();
        assert_eq!(refused.code, "share.already_running");
        // Refused, and the running one untouched: the slot is not closed behind
        // a service that is still serving.
        assert_eq!(control.status().port, running.port);
        control.close();
    }

    #[test]
    fn a_port_something_else_holds_is_refused_and_named() {
        // Held on every interface, which is where the service would take it.
        let held = TcpListener::bind(anywhere(0)).unwrap();
        let port = held.local_addr().unwrap().port();
        let control = ShareControl::default();
        let refused = control.open(Some(port), "en", &[]).unwrap_err();
        assert_eq!(refused.code, "share.port.in_use");
        // The number travels with the failure: the message that names the port
        // is written in one place and read out of this.
        assert_eq!(
            refused.params.get("port").map(String::as_str),
            Some(port.to_string().as_str())
        );
        // A failure leaves nothing behind it.
        assert_eq!(control.status().port, None);
    }
}
