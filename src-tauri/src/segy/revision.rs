//! SEG-Y revision identifiers.
//!
//! Maps each recognized SEG-Y specification revision to an enum variant
//! so the rest of the system can switch behavior by revision without
//! relying on string comparisons.

use byteorder::{BigEndian, ByteOrder as _, LittleEndian};
use serde::{Deserialize, Serialize};
use std::fmt;

/// Recognized SEG-Y specification revisions.
///
/// Used as a key in [`SpecRegistry`] and for revision detection.
/// Phase 2 adds `detect_from_binary_header()` — this enum only declares variants.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SegyRevision {
    /// Original SEG-Y (1975).
    Rev0,
    /// SEG-Y Rev 1 (2002).
    Rev1,
    /// SEG-Y Rev 2 (2017).
    Rev2,
    /// SEG-Y Rev 2.1 (2022).
    Rev21,
    /// Unknown or unrecognised revision.
    Unknown,
}

impl fmt::Display for SegyRevision {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SegyRevision::Rev0 => write!(f, "Rev 0"),
            SegyRevision::Rev1 => write!(f, "Rev 1"),
            SegyRevision::Rev2 => write!(f, "Rev 2"),
            SegyRevision::Rev21 => write!(f, "Rev 2.1"),
            SegyRevision::Unknown => write!(f, "Unknown"),
        }
    }
}

/// Detect SEG-Y revision from binary header unassigned bytes.
///
/// Reads bytes 3501-3502 of the binary header (unassigned[240..242]).
/// Per SEG-Y Rev 1 spec: 0 = Rev 0, 1 = Rev 1, anything else = Unknown.
///
/// # Arguments
///
/// * `unassigned` - The unassigned bytes from the binary header (bytes 3261-3600, 340 bytes)
/// * `byte_order` - The detected byte order of the file (from BinaryHeader.byte_order)
pub fn detect_revision_from_binary_header(
    unassigned: &[u8],
    byte_order: crate::segy::ByteOrder,
) -> SegyRevision {
    // SEG-Y Rev 1 spec: bytes 3501-3502 of binary header
    // File byte 3501 = unassigned[3501 - 3261] = unassigned[240]
    const REVISION_OFFSET: usize = 240;

    if unassigned.len() < REVISION_OFFSET + 2 {
        return SegyRevision::Unknown;
    }

    let raw = &unassigned[REVISION_OFFSET..REVISION_OFFSET + 2];
    let value = match byte_order {
        crate::segy::ByteOrder::BigEndian => BigEndian::read_i16(raw),
        crate::segy::ByteOrder::LittleEndian => LittleEndian::read_i16(raw),
    };

    match value {
        0 => SegyRevision::Rev0,
        1 => {
            if matches!(byte_order, crate::segy::ByteOrder::LittleEndian) {
                SegyRevision::Rev1
            } else {
                SegyRevision::Unknown
            }
        }
        256 => {
            if matches!(byte_order, crate::segy::ByteOrder::BigEndian) {
                SegyRevision::Rev1
            } else {
                SegyRevision::Unknown
            }
        }
        _ => SegyRevision::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_revision_display() {
        assert_eq!(SegyRevision::Rev0.to_string(), "Rev 0");
        assert_eq!(SegyRevision::Rev1.to_string(), "Rev 1");
        assert_eq!(SegyRevision::Rev2.to_string(), "Rev 2");
        assert_eq!(SegyRevision::Rev21.to_string(), "Rev 2.1");
        assert_eq!(SegyRevision::Unknown.to_string(), "Unknown");
    }

    #[test]
    fn test_revision_serde() {
        let rev = SegyRevision::Rev1;
        let json = serde_json::to_string(&rev).unwrap();
        let deserialized: SegyRevision = serde_json::from_str(&json).unwrap();
        assert_eq!(rev, deserialized);
    }

    #[test]
    fn test_detect_rev0_big_endian() {
        let mut unassigned = vec![0u8; 340];
        // Bytes 240-241: 0x00, 0x00 = 0 (Rev 0) in big-endian
        unassigned[240] = 0x00;
        unassigned[241] = 0x00;
        assert_eq!(
            detect_revision_from_binary_header(&unassigned, crate::segy::ByteOrder::BigEndian),
            SegyRevision::Rev0
        );
    }

    #[test]
    fn test_detect_rev1_big_endian() {
        let mut unassigned = vec![0u8; 340];
        // Bytes 240-241: 0x01, 0x00 = 256 (Rev 1) in big-endian
        // BigEndian: 0x0100 = 256
        unassigned[240] = 0x01;
        unassigned[241] = 0x00;
        assert_eq!(
            detect_revision_from_binary_header(&unassigned, crate::segy::ByteOrder::BigEndian),
            SegyRevision::Rev1
        );
    }

    #[test]
    fn test_detect_unknown_invalid_value() {
        let mut unassigned = vec![0u8; 340];
        // Bytes 240-241: 0x00, 0x02 = 2 (Unknown)
        unassigned[240] = 0x00;
        unassigned[241] = 0x02;
        assert_eq!(
            detect_revision_from_binary_header(&unassigned, crate::segy::ByteOrder::BigEndian),
            SegyRevision::Unknown
        );
    }

    #[test]
    fn test_detect_unknown_empty_slice() {
        assert_eq!(
            detect_revision_from_binary_header(&[], crate::segy::ByteOrder::BigEndian),
            SegyRevision::Unknown
        );
    }

    #[test]
    fn test_detect_unknown_short_slice() {
        let unassigned = vec![0u8; 100];
        assert_eq!(
            detect_revision_from_binary_header(&unassigned, crate::segy::ByteOrder::BigEndian),
            SegyRevision::Unknown
        );
    }

    #[test]
    fn test_detect_rev1_little_endian() {
        let mut unassigned = vec![0u8; 340];
        // Bytes 240-241: 0x01, 0x00 = 1 (Rev 1) in little-endian
        unassigned[240] = 0x01;
        unassigned[241] = 0x00;
        assert_eq!(
            detect_revision_from_binary_header(&unassigned, crate::segy::ByteOrder::LittleEndian),
            SegyRevision::Rev1
        );
    }
}
