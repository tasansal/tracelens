//! Legacy shim — all commands have moved to `crate::ipc`.
//!
//! This file is kept so the module declaration in `lib.rs` compiles without
//! a large-bang rename. Commands are registered directly from `ipc::*` in
//! `lib.rs`; nothing here is public-facing any more.
