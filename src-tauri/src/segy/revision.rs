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

/// Detect SEG-Y revision from binary header bytes.
///
/// Reads bytes 3501-3502 of the file's binary header (offset 300 within the 400-byte
/// binary header block that starts at file byte 3201).
/// Per SEG-Y Rev 1 spec: 0 = Rev 0, 1 = Rev 1, anything else = Unknown.
///
/// # Arguments
///
/// * `header_bytes` - The full 400-byte binary header buffer (bytes 3201-3600 of the file)
/// * `byte_order` - The detected byte order of the file (from BinaryHeader.byte_order)
pub fn detect_revision_from_binary_header(
    header_bytes: &[u8],
    byte_order: crate::segy::ByteOrder,
) -> SegyRevision {
    // SEG-Y Rev 1 spec: revision number is at file bytes 3501-3502.
    // Binary header starts at file byte 3201, so offset = 3501 - 3201 = 300.
    const REVISION_OFFSET: usize = 300;

    if header_bytes.len() < REVISION_OFFSET + 2 {
        return SegyRevision::Unknown;
    }

    let raw = &header_bytes[REVISION_OFFSET..REVISION_OFFSET + 2];
    let value = match byte_order {
        crate::segy::ByteOrder::BigEndian => BigEndian::read_i16(raw),
        crate::segy::ByteOrder::LittleEndian => LittleEndian::read_i16(raw),
    };

    // After byte-order-correct parsing:
    //   Rev 0 → 0x0000 → value 0 in either byte order
    //   Rev 1 → 0x0100 → value 256 in BE, value 1 in LE
    // Both representations of the same revision are accepted for tolerance against
    // non-standard files that wrote the revision field in the wrong byte order.
    match value {
        0 => SegyRevision::Rev0,
        1 | 256 => SegyRevision::Rev1,
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
        // Full 400-byte binary header buffer; revision field at offset 300 (file bytes 3501-3502)
        let mut unassigned = vec![0u8; 400];
        unassigned[300] = 0x00;
        unassigned[301] = 0x00;
        assert_eq!(
            detect_revision_from_binary_header(&unassigned, crate::segy::ByteOrder::BigEndian),
            SegyRevision::Rev0
        );
    }

    #[test]
    fn test_detect_rev1_big_endian() {
        // Full 400-byte binary header buffer; revision field at offset 300 (file bytes 3501-3502)
        // BigEndian: 0x0100 = 256, which is accepted as Rev 1
        let mut unassigned = vec![0u8; 400];
        unassigned[300] = 0x01;
        unassigned[301] = 0x00;
        assert_eq!(
            detect_revision_from_binary_header(&unassigned, crate::segy::ByteOrder::BigEndian),
            SegyRevision::Rev1
        );
    }

    #[test]
    fn test_detect_unknown_invalid_value() {
        let mut unassigned = vec![0u8; 400];
        unassigned[300] = 0x00;
        unassigned[301] = 0x02;
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
        // Buffer shorter than 302 bytes — cannot read revision field
        let unassigned = vec![0u8; 100];
        assert_eq!(
            detect_revision_from_binary_header(&unassigned, crate::segy::ByteOrder::BigEndian),
            SegyRevision::Unknown
        );
    }

    #[test]
    fn test_detect_rev1_little_endian() {
        // LittleEndian: [0x01, 0x00] = 1, which is Rev 1
        let mut unassigned = vec![0u8; 400];
        unassigned[300] = 0x01;
        unassigned[301] = 0x00;
        assert_eq!(
            detect_revision_from_binary_header(&unassigned, crate::segy::ByteOrder::LittleEndian),
            SegyRevision::Rev1
        );
    }

    #[test]
    fn test_detect_rev1_big_endian_reversed_bytes() {
        // Regression: a file that stored the revision as [0x00, 0x01] in a big-endian
        // context (value=1 after BE parse). Previously returned Unknown; must now return Rev1
        // to tolerate non-standard files that wrote the revision field in the wrong byte order.
        let mut unassigned = vec![0u8; 400];
        unassigned[300] = 0x00;
        unassigned[301] = 0x01;
        assert_eq!(
            detect_revision_from_binary_header(&unassigned, crate::segy::ByteOrder::BigEndian),
            SegyRevision::Rev1
        );
    }

    #[test]
    fn test_detect_rev1_little_endian_reversed_bytes() {
        // Symmetric regression: [0x00, 0x01] in LE gives value=256, now also Rev1.
        let mut unassigned = vec![0u8; 400];
        unassigned[300] = 0x00;
        unassigned[301] = 0x01;
        assert_eq!(
            detect_revision_from_binary_header(&unassigned, crate::segy::ByteOrder::LittleEndian),
            SegyRevision::Rev1
        );
    }
}
