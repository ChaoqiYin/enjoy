//! 共享服务: the read-only WebDAV service that offers one space's 共享清单 to the
//! other devices on the local network.
//!
//! It is a service the user starts and stops by hand, and it belongs to the space
//! that started it: nothing else in the application opens the port, and leaving
//! the space ends it. It reads a snapshot of the list taken when it started, so
//! what a device sees does not change under it while it is playing.
//!
//! Three pieces, in three files:
//!
//! - [`control`] is the slot: whether a service is running, starting one, ending
//!   one. It is what the interface asks, and it answers without starting
//!   anything — the navigation indicator asks it from every page.
//! - [`service`] is the running thing: the bound port, the thread serving it, and
//!   the two answers a request can get.
//! - [`fs`] is what the service serves: a virtual filesystem whose every name is
//!   one entry of the 共享清单.

pub(crate) mod control;
mod fs;
mod landing;
mod service;
#[cfg(test)]
mod service_tests;

pub(crate) use control::{ShareControl, ShareStatus};
pub(crate) use service::DEFAULT_PORT;
