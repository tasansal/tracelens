//! I/O layer: storage backends, URI routing, credential builders, and trace cache.
//!
//! ## Submodules
//!
//! - [`storage`] — [`SegyStorage`] dispatcher (local vs remote)
//! - [`local`] — memory-mapped local file backend
//! - [`remote`] — `object_store`-based remote backend (S3, GCS, Azure, HTTP)
//! - [`uri`] — URL parsing and HTTP-to-native-scheme conversion
//! - [`credentials`] — per-provider option builders consumed by `parse_url_opts`

pub mod credentials;
pub mod local;
pub mod remote;
pub mod storage;
pub mod uri;
