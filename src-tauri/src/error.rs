//! Error types shared across the SEG-Y parser and Tauri commands.
//!
//! Errors are serialized as tagged JSON objects to enable clean
//! TypeScript discriminated unions on the frontend.

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Application error types using discriminated union pattern for TypeScript interop.
///
/// This enum uses internally-tagged serialization (`#[serde(tag = "name")]`) to create
/// a discriminated union that TypeScript can handle naturally. Each variant serializes
/// to a JSON object with a `name` field as the discriminator.
///
/// # Examples
///
/// ```rust
/// use app_lib::error::AppError;
///
/// let error = AppError::IoError {
///     message: "Failed to read file".to_string(),
/// };
///
/// // Serializes to: { "name": "IoError", "message": "Failed to read file" }
/// ```
#[derive(Error, Debug, Serialize, Deserialize)]
#[serde(tag = "name")]
pub enum AppError {
    /// I/O operation failed (file read/write, network, etc.)
    #[error("IO error: {message}")]
    IoError { message: String },

    /// Parsing or data format error
    #[error("Parse error: {message}")]
    ParseError { message: String },

    /// Invalid input or validation error
    #[error("Validation error: {message}")]
    ValidationError { message: String },

    /// SEG-Y specific parsing errors
    #[error("SEG-Y error: {message}")]
    SegyError { message: String },
}

/// Convert standard IO errors into the app error type.
impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        AppError::IoError {
            message: error.to_string(),
        }
    }
}

/// Convert JSON parsing errors into the app error type.
impl From<serde_json::Error> for AppError {
    fn from(error: serde_json::Error) -> Self {
        AppError::ParseError {
            message: error.to_string(),
        }
    }
}

/// Convert AppError into a JSON string for Tauri command results.
///
/// If serialization fails, fall back to the Display output.
impl From<AppError> for String {
    fn from(error: AppError) -> Self {
        serde_json::to_string(&error).unwrap_or_else(|_| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_serialization() {
        let error = AppError::IoError {
            message: "test error".to_string(),
        };

        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains(r#""name":"IoError"#));
        assert!(json.contains(r#""message":"test error"#));
    }

    #[test]
    fn test_error_deserialization() {
        let json = r#"{"name":"ParseError","message":"invalid format"}"#;
        let error: AppError = serde_json::from_str(json).unwrap();

        match error {
            AppError::ParseError { message } => {
                assert_eq!(message, "invalid format");
            }
            _ => panic!("Wrong error variant"),
        }
    }

    #[test]
    fn test_io_error_conversion() {
        let io_error = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let app_error: AppError = io_error.into();

        match app_error {
            AppError::IoError { message } => {
                assert!(message.contains("file not found"));
            }
            _ => panic!("Wrong error variant"),
        }
    }
}
