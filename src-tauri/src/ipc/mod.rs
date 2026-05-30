//! Tauri command handlers — thin IPC adapters organized by domain.
//!
//! Each submodule contains one cluster of related commands:
//! - [`file`] — SEG-Y file lifecycle (load, single-trace fetch)
//! - [`headers`] — Header spec and data queries, revision override
//! - [`data`] — Raw sample-block fetches for GPU rendering
//! - [`amplitude`] — Amplitude statistics and point-value reads
//! - [`custom_spec`] — Custom spec CRUD operations
//! - [`settings`] — App settings persistence and storage configuration

pub mod amplitude;
pub mod custom_spec;
pub mod data;
pub mod file;
pub mod headers;
pub mod settings;

/// Standard result type for all Tauri commands.
///
/// Errors are `String` because the frontend expects JSON-serialized
/// `AppError` values (see `error.rs`).
pub(super) type CommandResult<T> = Result<T, String>;
