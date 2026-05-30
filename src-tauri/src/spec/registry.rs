//! Schema registry mapping SEG-Y revisions to format specifications.
//!
//! Loads canonical specs at construction time via `include_str!` and provides
//! O(1) lookup by [`SegyRevision`]. Additional revisions can be loaded later
//! (Phase 2+); Rev 0 is always present.

use std::collections::HashMap;
use std::sync::LazyLock;

use crate::segy::SegyRevision;
use crate::spec::types::SegyFormatSpec;

/// Process-wide singleton registry, initialized on first access.
///
/// The embedded JSON specs are compiled into the binary, so parsing failure
/// is a developer bug — the panic is intentional.
static GLOBAL_REGISTRY: LazyLock<SpecRegistry> =
    LazyLock::new(|| SpecRegistry::new().expect("embedded SEG-Y specs must be valid JSON"));

/// Registry that maps [`SegyRevision`] keys to their [`SegyFormatSpec`] definitions.
///
/// Rev 0 is loaded eagerly during [`SpecRegistry::new()`]. Future revisions
/// can be loaded via `insert()` without changing the public API.
pub struct SpecRegistry {
    specs: HashMap<SegyRevision, SegyFormatSpec>,
}

impl SpecRegistry {
    /// Build a new registry pre-loaded with Rev 0 and Rev 1 specifications.
    ///
    /// Both specs are validated at construction time — a validation failure
    /// indicates a developer bug in the embedded JSON and returns `Err`.
    ///
    /// # Errors
    ///
    /// Returns `Err` if any embedded JSON cannot be deserialized or fails
    /// structural validation (overlapping bytes, invalid types, etc.).
    pub fn new() -> Result<Self, String> {
        // Load Rev 0 spec.
        const REV0_JSON: &str = include_str!("../../config/segy_rev0_spec.json");
        let rev0_spec: SegyFormatSpec = serde_json::from_str(REV0_JSON)
            .map_err(|e| format!("Failed to parse Rev 0 spec: {}", e))?;

        // Load Rev 1 spec.
        const REV1_JSON: &str = include_str!("../../config/segy_rev1_spec.json");
        let rev1_spec: SegyFormatSpec = serde_json::from_str(REV1_JSON)
            .map_err(|e| format!("Failed to parse Rev 1 spec: {}", e))?;

        // Validate both specs at load time (hard error per D-02).
        crate::spec::validator::validate(&rev0_spec)
            .map_err(|errors| format!("Rev 0 spec validation failed: {:?}", errors))?;
        crate::spec::validator::validate(&rev1_spec)
            .map_err(|errors| format!("Rev 1 spec validation failed: {:?}", errors))?;

        let mut specs = HashMap::new();
        specs.insert(SegyRevision::Rev0, rev0_spec);
        specs.insert(SegyRevision::Rev1, rev1_spec);

        Ok(Self { specs })
    }

    /// Look up the format spec for a revision, if loaded.
    pub fn get(&self, rev: SegyRevision) -> Option<&SegyFormatSpec> {
        self.specs.get(&rev)
    }

    /// Return the default format spec (Rev 0).
    ///
    /// # Panics
    ///
    /// Panics if Rev 0 is not loaded — this should never happen since
    /// [`new()`](Self::new) always loads it.
    pub fn default_spec(&self) -> &SegyFormatSpec {
        self.specs
            .get(&SegyRevision::Rev0)
            .expect("Rev 0 spec must be loaded")
    }

    /// Return a reference to the process-wide singleton registry.
    ///
    /// Initialized lazily on first access from the embedded JSON files.
    /// Cheaper than constructing a new registry per request.
    pub fn global() -> &'static Self {
        &GLOBAL_REGISTRY
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_registry_loads_rev0() {
        let registry = SpecRegistry::new().expect("Failed to create registry");
        let spec = registry.default_spec();
        assert_eq!(spec.version, "SEG-Y Rev 0 (1975)");
    }

    #[test]
    fn test_registry_get_rev0() {
        let registry = SpecRegistry::new().expect("Failed to create registry");
        assert!(registry.get(SegyRevision::Rev0).is_some());
    }

    #[test]
    fn test_registry_get_missing() {
        let registry = SpecRegistry::new().expect("Failed to create registry");
        assert!(registry.get(SegyRevision::Rev2).is_none());
    }

    #[test]
    fn test_registry_loads_rev1() {
        let registry = SpecRegistry::new().expect("Failed to create registry");
        let rev1 = registry
            .get(SegyRevision::Rev1)
            .expect("Rev 1 should be loaded");
        assert_eq!(rev1.version, "SEG-Y Rev 1 (2002)");
        assert_eq!(rev1.binary_header.fields.len(), 30); // 27 Rev 0 + 3 Rev 1
        assert!(rev1.trace_header.fields.len() > 60); // 60 Rev 0 + Rev 1 extensions
    }
}
