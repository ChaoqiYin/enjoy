pub mod commands;
mod control;
mod download;
mod verify;

#[cfg(test)]
mod config_tests;
#[cfg(test)]
mod control_tests;
#[cfg(test)]
mod download_tests;
#[cfg(test)]
mod verify_tests;

pub use control::UpdateControl;
