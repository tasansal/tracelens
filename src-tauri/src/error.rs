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

    /// Invalid URI or URL format
    #[error("Invalid URI: {message}")]
    InvalidUri { message: String },

    /// Invalid byte range
    #[error("Invalid range: {message}")]
    InvalidRange { message: String },
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

    #[test]
    fn test_error_display_messages() {
        let io_err = AppError::IoError {
            message: "disk full".to_string(),
        };
        assert!(io_err.to_string().contains("disk full"));

        let parse_err = AppError::ParseError {
            message: "bad format".to_string(),
        };
        assert!(parse_err.to_string().contains("bad format"));

        let validation_err = AppError::ValidationError {
            message: "invalid input".to_string(),
        };
        assert!(validation_err.to_string().contains("invalid input"));

        let segy_err = AppError::SegyError {
            message: "trace parse failed".to_string(),
        };
        assert!(segy_err.to_string().contains("trace parse failed"));

        let uri_err = AppError::InvalidUri {
            message: "not-a-url".to_string(),
        };
        assert!(uri_err.to_string().contains("not-a-url"));

        let range_err = AppError::InvalidRange {
            message: "out of bounds".to_string(),
        };
        assert!(range_err.to_string().contains("out of bounds"));
    }

    #[test]
    fn test_parse_error_serialization() {
        let error = AppError::ParseError {
            message: "bad data".to_string(),
        };
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains(r#""name":"ParseError"#));
        assert!(json.contains(r#""message":"bad data"#));
    }

    #[test]
    fn test_validation_error_serialization() {
        let error = AppError::ValidationError {
            message: "invalid input".to_string(),
        };
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains(r#""name":"ValidationError"#));
        assert!(json.contains(r#""message":"invalid input"#));
    }

    #[test]
    fn test_segy_error_serialization() {
        let error = AppError::SegyError {
            message: "trace parse failed".to_string(),
        };
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains(r#""name":"SegyError"#));
        assert!(json.contains(r#""message":"trace parse failed"#));
    }

    #[test]
    fn test_invalid_uri_serialization() {
        let error = AppError::InvalidUri {
            message: "ftp://bad".to_string(),
        };
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains(r#""name":"InvalidUri"#));
        assert!(json.contains(r#""message":"ftp://bad"#));
        assert!(error.to_string().contains("ftp://bad"));
    }

    #[test]
    fn test_invalid_range_serialization() {
        let error = AppError::InvalidRange {
            message: "range 100..200 exceeds file".to_string(),
        };
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains(r#""name":"InvalidRange"#));
        assert!(json.contains(r#""message":"range 100..200 exceeds file"#));
        assert!(error.to_string().contains("range 100..200 exceeds file"));
    }

    #[test]
    fn test_io_error_from_std() {
        let io_error = std::io::Error::new(std::io::ErrorKind::NotFound, "file missing");
        let app_error: AppError = io_error.into();
        assert!(matches!(app_error, AppError::IoError { .. }));
    }

    #[test]
    fn test_error_deserialization_all_variants() {
        // IoError
        let json = r#"{"name":"IoError","message":"io failed"}"#;
        let err: AppError = serde_json::from_str(json).unwrap();
        assert!(matches!(err, AppError::IoError { .. }));

        // ParseError
        let json = r#"{"name":"ParseError","message":"parse failed"}"#;
        let err: AppError = serde_json::from_str(json).unwrap();
        assert!(matches!(err, AppError::ParseError { .. }));

        // ValidationError
        let json = r#"{"name":"ValidationError","message":"validation failed"}"#;
        let err: AppError = serde_json::from_str(json).unwrap();
        assert!(matches!(err, AppError::ValidationError { .. }));

        // SegyError
        let json = r#"{"name":"SegyError","message":"segy failed"}"#;
        let err: AppError = serde_json::from_str(json).unwrap();
        assert!(matches!(err, AppError::SegyError { .. }));
    }

    #[test]
    fn test_error_deserialization_unknown_type() {
        let json = r#"{"name":"UnknownVariant","message":"oops"}"#;
        let result: Result<AppError, _> = serde_json::from_str(json);
        assert!(result.is_err());
    }

    #[test]
    fn test_error_to_string_fallback() {
        let error = AppError::IoError {
            message: "test fallback".to_string(),
        };
        let as_string: String = error.into();
        // Should contain the error name or message
        assert!(as_string.contains("IoError") || as_string.contains("test fallback"));
    }

    #[test]
    fn test_serde_json_error_conversion() {
        let bad_json = "not valid json";
        let result: Result<AppError, _> = serde_json::from_str(bad_json);
        assert!(result.is_err());
        // The serde_json error should convert to AppError::ParseError
        let app_error: AppError = result.unwrap_err().into();
        assert!(matches!(app_error, AppError::ParseError { .. }));
    }
}
