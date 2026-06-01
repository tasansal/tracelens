//! Header spec layer: field specifications, spec registry, runtime extraction, and validation.
//!
//! Provides revision-aware header field definitions (loaded from embedded JSON), a
//! process-wide registry that maps `SegyRevision` → `SegyFormatSpec`, spec-driven
//! runtime field extraction (`RuntimeHeaderView`), and structural validation for
//! custom specs.

pub mod registry;
pub mod runtime;
pub mod types;
pub mod validator;
