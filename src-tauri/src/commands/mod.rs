//! The command surface, grouped by what each command is about.
//!
//! Every function here is a `#[tauri::command]`: it parses what the interface
//! sent, hands the work to the module that owns it, and turns the answer back.
//! Nothing else lives in this module — the media pass, the scan slot and the
//! space rules are all elsewhere, and this layer is only the place they get
//! named for IPC. That is what makes them testable: a rule behind a command was
//! reachable only through a window, and a rule behind a function is reachable
//! from a test.
//!
//! The pattern to copy is `open_video` as it was written before this module
//! existed: parse, delegate, and nothing more.

pub(crate) mod library;
pub(crate) mod scan;
pub(crate) mod share;
pub(crate) mod space;

#[cfg(test)]
mod share_tests;
#[cfg(test)]
mod space_tests;
