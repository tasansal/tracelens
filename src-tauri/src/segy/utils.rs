//! Utility functions for SEG-Y parsing

use serde::{Deserialize, Serialize};

/// Encoding types for textual header
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum TextEncoding {
    /// EBCDIC encoding (standard SEG-Y)
    #[default]
    Ebcdic,
    /// ASCII encoding (non-standard but sometimes used)
    Ascii,
}

/// Detect the encoding of a textual header by analyzing character distribution
///
/// Uses multiple heuristics to determine if data is ASCII or EBCDIC:
/// 1. Check for EBCDIC space (0x40) which is very common in EBCDIC SEG-Y
/// 2. Check for ASCII 'C' at line starts (standard in both encodings)
/// 3. Look for patterns that indicate EBCDIC vs ASCII
pub fn detect_text_encoding(data: &[u8]) -> TextEncoding {
    if data.is_empty() {
        return TextEncoding::Ebcdic;
    }

    // EBCDIC space is 0x40, ASCII space is 0x20
    // EBCDIC 'C' is 0xC3, ASCII 'C' is 0x43

    // Count occurrences of key bytes
    let ebcdic_space_count = data.iter().filter(|&&b| b == 0x40).count();
    let ascii_space_count = data.iter().filter(|&&b| b == 0x20).count();

    // Check first character of each 80-byte line (should be 'C' for card image)
    let mut ebcdic_c_count = 0;
    let mut ascii_c_count = 0;
    for i in 0..40 {
        let idx = i * 80;
        if idx < data.len() {
            if data[idx] == 0xC3 {
                ebcdic_c_count += 1;
            } // EBCDIC 'C'
            if data[idx] == 0x43 {
                ascii_c_count += 1;
            } // ASCII 'C'
        }
    }

    // Strong indicator: if we see many EBCDIC 'C' at line starts, it's EBCDIC
    if ebcdic_c_count > 10 {
        return TextEncoding::Ebcdic;
    }

    // Strong indicator: if we see many ASCII 'C' at line starts, it's ASCII
    if ascii_c_count > 10 {
        return TextEncoding::Ascii;
    }

    // Fallback: compare space characters
    // EBCDIC headers typically have many 0x40 bytes (EBCDIC space)
    // ASCII headers would have 0x20 bytes (ASCII space)
    if ebcdic_space_count > ascii_space_count * 2 {
        TextEncoding::Ebcdic
    } else if ascii_space_count > ebcdic_space_count * 2 {
        TextEncoding::Ascii
    } else {
        // Default to EBCDIC (standard SEG-Y)
        TextEncoding::Ebcdic
    }
}

/// EBCDIC to ASCII conversion table
///
/// This table maps EBCDIC character codes (0-255) to their ASCII equivalents.
/// Non-printable characters are mapped to space (0x20).
const EBCDIC_TO_ASCII_TABLE: [u8; 256] = [
    0x00, 0x01, 0x02, 0x03, 0x9C, 0x09, 0x86, 0x7F, // 0x00-0x07
    0x97, 0x8D, 0x8E, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, // 0x08-0x0F
    0x10, 0x11, 0x12, 0x13, 0x9D, 0x85, 0x08, 0x87, // 0x10-0x17
    0x18, 0x19, 0x92, 0x8F, 0x1C, 0x1D, 0x1E, 0x1F, // 0x18-0x1F
    0x80, 0x81, 0x82, 0x83, 0x84, 0x0A, 0x17, 0x1B, // 0x20-0x27
    0x88, 0x89, 0x8A, 0x8B, 0x8C, 0x05, 0x06, 0x07, // 0x28-0x2F
    0x90, 0x91, 0x16, 0x93, 0x94, 0x95, 0x96, 0x04, // 0x30-0x37
    0x98, 0x99, 0x9A, 0x9B, 0x14, 0x15, 0x9E, 0x1A, // 0x38-0x3F
    0x20, 0xA0, 0xE2, 0xE4, 0xE0, 0xE1, 0xE3, 0xE5, // 0x40-0x47 (space and accented chars)
    0xE7, 0xF1, 0xA2, 0x2E, 0x3C, 0x28, 0x2B, 0x7C, // 0x48-0x4F (. < ( + |)
    0x26, 0xE9, 0xEA, 0xEB, 0xE8, 0xED, 0xEE, 0xEF, // 0x50-0x57
    0xEC, 0xDF, 0x21, 0x24, 0x2A, 0x29, 0x3B, 0x5E, // 0x58-0x5F (! $ * ) ; ^)
    0x2D, 0x2F, 0xC2, 0xC4, 0xC0, 0xC1, 0xC3, 0xC5, // 0x60-0x67 (- /)
    0xC7, 0xD1, 0xA6, 0x2C, 0x25, 0x5F, 0x3E, 0x3F, // 0x68-0x6F (, % _ > ?)
    0xF8, 0xC9, 0xCA, 0xCB, 0xC8, 0xCD, 0xCE, 0xCF, // 0x70-0x77
    0xCC, 0x60, 0x3A, 0x23, 0x40, 0x27, 0x3D, 0x22, // 0x78-0x7F (` : # @ ' = ")
    0xD8, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67, // 0x80-0x87 (a-g)
    0x68, 0x69, 0xAB, 0xBB, 0xF0, 0xFD, 0xFE, 0xB1, // 0x88-0x8F (h-i)
    0xB0, 0x6A, 0x6B, 0x6C, 0x6D, 0x6E, 0x6F, 0x70, // 0x90-0x97 (j-p)
    0x71, 0x72, 0xAA, 0xBA, 0xE6, 0xB8, 0xC6, 0xA4, // 0x98-0x9F (q-r)
    0xB5, 0x7E, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, // 0xA0-0xA7 (~ s-x)
    0x79, 0x7A, 0xA1, 0xBF, 0xD0, 0x5B, 0xDE, 0xAE, // 0xA8-0xAF (y-z [)
    0xAC, 0xA3, 0xA5, 0xB7, 0xA9, 0xA7, 0xB6, 0xBC, // 0xB0-0xB7
    0xBD, 0xBE, 0xDD, 0xA8, 0xAF, 0x5D, 0xB4, 0xD7, // 0xB8-0xBF (])
    0x7B, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, // 0xC0-0xC7 ({ A-G)
    0x48, 0x49, 0xAD, 0xF4, 0xF6, 0xF2, 0xF3, 0xF5, // 0xC8-0xCF (H-I)
    0x7D, 0x4A, 0x4B, 0x4C, 0x4D, 0x4E, 0x4F, 0x50, // 0xD0-0xD7 (} J-P)
    0x51, 0x52, 0xB9, 0xFB, 0xFC, 0xF9, 0xFA, 0xFF, // 0xD8-0xDF (Q-R)
    0x5C, 0xF7, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, // 0xE0-0xE7 (\ S-X)
    0x59, 0x5A, 0xB2, 0xD4, 0xD6, 0xD2, 0xD3, 0xD5, // 0xE8-0xEF (Y-Z)
    0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, // 0xF0-0xF7 (0-7)
    0x38, 0x39, 0xB3, 0xDB, 0xDC, 0xD9, 0xDA, 0x9F, // 0xF8-0xFF (8-9)
];

/// Convert EBCDIC bytes to ASCII string
///
/// This function converts EBCDIC-encoded bytes to an ASCII string.
/// Non-printable ASCII characters (< 0x20 or > 0x7E, except newline)
/// are replaced with spaces.
///
/// # Arguments
///
/// * `ebcdic` - Slice of EBCDIC-encoded bytes
///
/// # Returns
///
/// ASCII string with non-printable characters replaced by spaces
pub fn ebcdic_to_ascii(ebcdic: &[u8]) -> String {
    ebcdic
        .iter()
        .map(|&byte| {
            let ascii = EBCDIC_TO_ASCII_TABLE[byte as usize];
            // Replace non-printable ASCII with space (except newline)
            if ascii == b'\n' || (0x20..=0x7E).contains(&ascii) {
                ascii as char
            } else {
                ' '
            }
        })
        .collect()
}

/// Convert text bytes to ASCII string based on detected encoding
///
/// Automatically detects whether the input is EBCDIC or ASCII and converts accordingly.
///
/// # Arguments
///
/// * `data` - Slice of bytes (either EBCDIC or ASCII encoded)
///
/// # Returns
///
/// ASCII string with non-printable characters replaced by spaces
pub fn text_to_ascii(data: &[u8]) -> String {
    match detect_text_encoding(data) {
        TextEncoding::Ascii => {
            // Already ASCII, just clean up non-printable characters
            data.iter()
                .map(|&byte| {
                    if byte == b'\n' || (0x20..=0x7E).contains(&byte) {
                        byte as char
                    } else {
                        ' '
                    }
                })
                .collect()
        }
        TextEncoding::Ebcdic => ebcdic_to_ascii(data),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ebcdic_to_ascii_space() {
        // EBCDIC 0x40 = ASCII space
        let result = ebcdic_to_ascii(&[0x40]);
        assert_eq!(result, " ");
    }

    #[test]
    fn test_ebcdic_to_ascii_letters() {
        // EBCDIC 0xC1-0xC9 = A-I
        let ebcdic = vec![0xC1, 0xC2, 0xC3]; // ABC in EBCDIC
        let result = ebcdic_to_ascii(&ebcdic);
        assert_eq!(result, "ABC");
    }

    #[test]
    fn test_ebcdic_to_ascii_digits() {
        // EBCDIC 0xF0-0xF9 = 0-9
        let ebcdic = vec![0xF0, 0xF1, 0xF2, 0xF3]; // 0123 in EBCDIC
        let result = ebcdic_to_ascii(&ebcdic);
        assert_eq!(result, "0123");
    }
}
