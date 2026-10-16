//! The plugin host: the one place in the kernel that knows plugins exist.
//!
//! Only the mount point catalog is here so far. It is a generated file
//! (`npm run generate:plugins`, held in place by `npm run check`) because the
//! six mount points are also written down in the interface's types and in the
//! page a plugin author reads; `mount_points.rs` says where it comes from.
//!
//! The dispatch that reads this table, the manifest validation and the
//! install/enable/uninstall cycle arrive with #84 and #86, and they are what
//! will consume it. Until then nothing in the kernel calls it, which is what the
//! allowance below is for — a warning that the whole catalog is dead code says
//! nothing a reader does not already know from this comment.

#[allow(dead_code)]
pub(crate) mod mount_points;
