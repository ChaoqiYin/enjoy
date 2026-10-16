//! The order the user arranged the plugins in, as a file of its own.
//!
//! It is `order.json`, beside the enable record and beside everything else this
//! installation keeps, and it holds the ids in the order the user put them in.
//! A file rather than a column, a second record, or a field on the enable
//! record, and the reason is what the two facts are about: the enable record
//! names the plugins that are **on**, and it names what is on rather than what
//! is off because that is what makes safe mode one rename ([`super::store`]).
//! The order names plugins that are **off** too — switching one off keeps its
//! place, so that switching it back on does not move it past the plugins the
//! user put after it — and a record whose whole meaning is "which of these are
//! running" cannot also hold "where the ones that are not running sit" without
//! becoming two records in one file.
//!
//! Two more things follow from putting it in its own file, and both are the
//! point rather than a side effect:
//!
//! - **Safe mode does not take the arrangement away.** Safe mode is putting the
//!   enable record aside, and it is the thing a user reaches for when the window
//!   will not come up. It is a recovery action about *which* plugins run; it has
//!   no business answering *in what order*.
//! - **An order outlives the plugin set it was written against.** A stored order
//!   may name a plugin that is no longer installed — [`super::PluginHost`]'s
//!   rotation ignores those ([`super::registry::Registry::reorder`]) — and a
//!   file that has to agree with the directory listing cannot hold that.
//!
//! What it does *not* do is load anything or decide anything: which ids are
//! worth writing is [`super::store`]'s, and what the rotation does with them is
//! the host's. This file is the name of the file, its shape, and the one rule
//! about a file that cannot be read.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// The file the order the user arranged is written down in.
pub(crate) const FILE: &str = "order.json";

/// The order the user arranged the plugins in.
///
/// A file that is not there means no order has been arranged yet, and a file
/// that cannot be read means the same thing rather than an error: the plugins
/// directory is the user's to edit by hand, and a stray byte in one file must
/// not be able to keep the plugin page from being drawn — the same rule the
/// enable record is read under, for the same reason.
pub(crate) fn read(directory: &Path) -> Vec<String> {
    let text = match fs::read_to_string(directory.join(FILE)) {
        Ok(text) => text,
        Err(_) => return Vec::new(),
    };
    let record: Record = match serde_json::from_str(&text) {
        Ok(record) => record,
        Err(error) => {
            tracing::warn!(%error, "the plugin order could not be read; the plugins keep the order the directory lists them in");
            return Vec::new();
        }
    };
    record.order
}

/// Writes the order down, making the plugins directory if it is not there yet.
pub(crate) fn write(directory: &Path, order: &[String]) -> Result<(), AppError> {
    fs::create_dir_all(directory).map_err(|error| {
        AppError::new("plugin.state.failed", error).with_param("path", directory.to_string_lossy())
    })?;
    let record = Record {
        order: order.to_vec(),
    };
    let text = serde_json::to_string_pretty(&record)
        .map_err(|error| AppError::new("plugin.state.failed", error))?;
    let path = directory.join(FILE);
    fs::write(&path, text).map_err(|error| {
        AppError::new("plugin.state.failed", error).with_param("path", path.to_string_lossy())
    })
}

/// What the order file holds: the ids, in the order the user put them in.
#[derive(Deserialize, Serialize)]
struct Record {
    order: Vec<String>,
}
