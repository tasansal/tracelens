//! Legacy shim — all window/settings commands have moved to `crate::ipc::settings`.
//!
//! This file is kept so the module declaration in `lib.rs` compiles without
//! a large-bang rename. Commands are registered directly from `ipc::settings`
//! in `lib.rs`; nothing here is public-facing any more.
