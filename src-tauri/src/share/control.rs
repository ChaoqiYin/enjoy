//! The slot the 共享服务 occupies: whether one is running, starting one, ending
//! one.
//!
//! One at a time, and only when the user asks. Nothing else in the application
//! opens the port, and no failure here leaves one open: a service that could not
//! start reports why, and the slot goes back to holding nothing.

use serde::Serialize;
use std::sync::{Mutex, MutexGuard};

use crate::error::AppError;

use super::activity::Device;
use super::addresses::Address;
use super::credentials::Credentials;
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
///
/// `list_changed` is the third, and it is the same shape of fact as
/// `needs_restart`: a service holds the list it was started over, and the list
/// can be added to or taken from while it runs. It is answered by comparing the
/// two lists rather than by being told that something was toggled, so a change
/// nobody clicked — a rescan that deleted records, a file removed from the
/// index — is seen too.
///
/// The credentials travel in the same answer because they are read off the same
/// page, and a page that had to ask twice for two halves of one sentence would
/// be able to show a password beside a port it does not go with. They are the
/// credentials in the preferences — what a service started now would enforce —
/// which is why `needs_restart` has to be said separately: regenerating a
/// password while the service is running changes this answer and not what the
/// running service will accept.
///
/// `devices` is the last fact, and the only one that changes without the user
/// doing anything: a client making a request is what puts a row there, and a
/// client going quiet is what takes it away. The interface reads this again on
/// a timer for exactly that reason, and it is empty whenever nothing is running —
/// nobody is connected to a service that is not there.
///
/// `addresses` is not about the service at all: it is where this machine can be
/// reached, which is true whether or not anything is listening. It travels here
/// because the page reads the two together — an address without a port is half
/// of what the user has to type — and because a machine's addresses change while
/// a service is running, when the wireless is switched or a cable is plugged in.
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareStatus {
    pub port: Option<u16>,
    pub missing_files: usize,
    pub username: String,
    pub password: String,
    /// Whether a service is running that would refuse the very password above
    /// it, because the password was regenerated after it started.
    pub needs_restart: bool,
    /// Whether a service is running over a list other than the one the space
    /// holds now: what a client is offered is not what the user has picked, and
    /// only restarting the service makes them the same again.
    pub list_changed: bool,
    pub devices: Vec<Device>,
    pub addresses: Vec<Address>,
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

    /// Whether anything is running right now.
    ///
    /// The one question that is not about *what* is running: it is asked when
    /// the window is asked to close, where the answer decides whether there is
    /// anything the user should be told before it happens
    /// ([`crate::closing`]). Nothing else is read, because nothing else is
    /// wanted — a close that is held is held for whoever is watching, and that
    /// is exactly the fact of a service being there.
    pub fn running(&self) -> bool {
        self.lock().is_some()
    }

    /// What is running right now, against the credentials the application is
    /// keeping.
    ///
    /// Answered without starting anything, because the question is asked from
    /// every page: the navigation entry carries an indicator for a service the
    /// user may have started on another one, and a status that had to open a port
    /// to be read would turn looking at the interface into starting a service.
    ///
    /// The credentials are handed in rather than held here, because where they
    /// are kept is the preferences and this module knows about ports and threads.
    /// What it does with them is compare: a service holds the password it was
    /// started with, and one that no longer matches the stored password is a
    /// service whose password has been changed underneath it.
    ///
    /// `paths` is the 共享清单 of the space the service belongs to, read by the
    /// caller for the same reason and compared the same way. Both comparisons
    /// are only meaningful against a running service, which is why the caller
    /// that is ending one (or asking with none running) passes an empty list and
    /// gets the same answer it would from the real one.
    pub fn status(
        &self,
        credentials: &Credentials,
        addresses: Vec<Address>,
        paths: &[String],
    ) -> ShareStatus {
        let (port, missing_files, needs_restart, list_changed, devices) = match self.lock().as_ref()
        {
            Some(service) => (
                Some(service.port()),
                service.missing(),
                service.credentials() != credentials,
                service.paths() != paths,
                service.devices(),
            ),
            // Nothing is running, so there is nothing left to restart, no
            // list that could be out of step, nobody is connected, and
            // nothing is on offer: the credentials and the machine's own
            // addresses are the whole of this answer.
            None => (None, 0, false, false, Vec::new()),
        };
        ShareStatus {
            port,
            missing_files,
            username: credentials.username.clone(),
            password: credentials.password.clone(),
            needs_restart,
            list_changed,
            devices,
            addresses,
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
        credentials: Credentials,
        addresses: Vec<Address>,
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
        let service = Service::start(requested, language, paths, credentials.clone())?;
        *slot = Some(service);
        // The slot is handed back before the status is read, since reading it
        // takes the lock again: the answer to "what is running" is composed in
        // one place, and a freshly started service is no exception to it.
        drop(slot);
        Ok(self.status(&credentials, addresses, paths))
    }

    /// Ends the service. Returns once it has ended and the port is free again.
    ///
    /// The slot is emptied before the service is ended, so that the lock is not
    /// held across the join: ending is the one operation here that waits on
    /// something else, and holding the slot's lock while it does would make the
    /// status unreadable for exactly as long as the interface is being told the
    /// service stopped.
    pub fn close(&self, credentials: &Credentials, addresses: Vec<Address>) -> ShareStatus {
        let service = self.lock().take();
        if let Some(service) = service {
            service.end();
        }
        // No list to compare against: the service that held one has just ended,
        // and a service that is not running is not offering a stale list.
        self.status(credentials, addresses, &[])
    }
}
