//! SEG-Y Textual Header (3200 bytes EBCDIC)
//!
//! The textual header contains 40 card images (80 bytes each) in EBCDIC encoding.
//! Cards 1-22 contain predefined information, cards 23-39 are unassigned for optional use,
//! and card 40 is typically a summary line.

use serde::{Deserialize, Serialize};
use std::io::{self, Read};

use crate::segy::utils::{detect_text_encoding, text_to_ascii, TextEncoding};

/// Textual header consisting of 3200 bytes of EBCDIC or ASCII card images
///
/// The textual header is the first block in a SEG-Y file and contains
/// human-readable information about the seismic data. Each card image
/// should start with 'C' in the first column.
///
/// Encoding is automatically detected - standard files use EBCDIC, but some
/// non-standard files may use ASCII.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextualHeader {
    /// Raw data (3200 bytes, either EBCDIC or ASCII)
    #[serde(skip)]
    raw_data: Vec<u8>,

    /// Detected encoding
    #[serde(skip)]
    encoding: TextEncoding,

    /// Card images converted to ASCII lines for frontend display
    pub lines: Vec<String>,
}

impl TextualHeader {
    /// Size of the textual header in bytes
    pub const SIZE: usize = 3200;

    /// Number of card images
    pub const CARD_COUNT: usize = 40;

    /// Bytes per card image
    pub const CARD_SIZE: usize = 80;

    /// Create a new TextualHeader from raw bytes (EBCDIC or ASCII)
    ///
    /// Automatically detects the encoding and converts to ASCII lines.
    ///
    /// # Arguments
    ///
    /// * `data` - Exactly 3200 bytes of EBCDIC or ASCII-encoded data
    ///
    /// # Errors
    ///
    /// Returns an error if the data length is not exactly 3200 bytes
    pub fn new(data: Vec<u8>) -> Result<Self, String> {
        if data.len() != Self::SIZE {
            return Err(format!(
                "Textual header must be exactly {} bytes, got {}",
                Self::SIZE,
                data.len()
            ));
        }

        // Detect encoding
        let encoding = detect_text_encoding(&data);

        // Convert card images to ASCII lines
        let lines = (0..Self::CARD_COUNT)
            .map(|i| {
                let start = i * Self::CARD_SIZE;
                let end = start + Self::CARD_SIZE;
                let card_bytes = &data[start..end];
                text_to_ascii(card_bytes)
            })
            .collect();

        Ok(Self {
            raw_data: data,
            encoding,
            lines,
        })
    }

    /// Parse a textual header from a reader
    ///
    /// # Arguments
    ///
    /// * `reader` - A reader positioned at the start of the textual header
    ///
    /// # Errors
    ///
    /// Returns an error if reading fails or insufficient data is available
    pub fn from_reader<R: Read>(reader: &mut R) -> io::Result<Self> {
        let mut buffer = vec![0u8; Self::SIZE];
        reader.read_exact(&mut buffer)?;

        Self::new(buffer).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
    }

    /// Get raw bytes (EBCDIC or ASCII depending on detected encoding)
    pub fn raw_data(&self) -> &[u8] {
        &self.raw_data
    }

    /// Get the detected encoding
    pub fn encoding(&self) -> TextEncoding {
        self.encoding
    }
}

impl Default for TextualHeader {
    fn default() -> Self {
        // Create a blank textual header filled with EBCDIC spaces (0x40).
        // This matches the SEG-Y expectation of space-padded card images.
        let raw_data = vec![0x40; Self::SIZE];
        let lines = vec![String::new(); Self::CARD_COUNT];
        Self {
            raw_data,
            encoding: TextEncoding::Ebcdic,
            lines,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_textual_header_size() {
        let header = TextualHeader::default();
        assert_eq!(header.raw_data().len(), TextualHeader::SIZE);
    }

    #[test]
    fn test_invalid_size() {
        let data = vec![0u8; 100];
        assert!(TextualHeader::new(data).is_err());
    }
}
