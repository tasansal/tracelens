//! Data types shared by the rendering pipeline and frontend.

use serde::{Deserialize, Serialize};

/// Colormap types
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ColormapType {
    /// Red (negative) → White (zero) → Blue (positive)
    Seismic,
    /// Black to White
    Grayscale,
    /// White to Black
    GrayscaleInverted,
    /// Viridis (perceptually uniform)
    Viridis,
}

/// Amplitude scaling strategies.
///
/// All global modes expect a pre-computed `clip_value` so that normalization
/// is consistent across tiles.  AGC is the only mode that computes gain
/// locally (per-trace, sliding window).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum AmplitudeScaling {
    /// Global percentile clipping.
    /// `clip_value` is the absolute amplitude at the chosen percentile,
    /// pre-computed by `scan_amplitude_range`.
    GlobalPercentile {
        #[serde(rename = "clipValue")]
        clip_value: f32,
    },
    /// Global fixed value scaling.
    /// `clip_value` = max_amplitude * 10^(gain_db/20), pre-computed on the frontend.
    GlobalFixed {
        #[serde(rename = "clipValue")]
        clip_value: f32,
    },
    /// Automatic Gain Control (per-trace, sliding window).
    /// The window is expressed in samples.  When `None` the full trace is used.
    Agc {
        #[serde(rename = "windowSize")]
        window_size: Option<usize>,
    },
}

/// Rendering mode
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RenderMode {
    /// Variable Density only
    VariableDensity,
    /// Wiggle traces only
    Wiggle,
    /// Combined Wiggle + VD
    WiggleVariableDensity,
}

/// Image encoding format
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ImageFormat {
    /// PNG encoding (good compression, widely supported)
    Png,
}

/// Rendered image result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderedImage {
    /// Pixel width of the encoded image.
    pub width: u32,
    /// Pixel height of the encoded image.
    pub height: u32,
    /// Base64-encoded image data (format depends on `format` field)
    pub data: String,
    /// Encoding format of `data`.
    pub format: ImageFormat,
}

/// Wiggle rendering configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WiggleConfig {
    /// Line width in pixels.
    pub line_width: f32,
    /// RGB line color.
    pub line_color: [u8; 3], // RGB
    /// Fill positive lobes if true.
    pub fill_positive: bool,
    /// Fill negative lobes if true.
    pub fill_negative: bool,
    /// RGB fill color for positive amplitudes.
    pub positive_fill_color: [u8; 3], // RGB
    /// RGB fill color for negative amplitudes.
    pub negative_fill_color: [u8; 3], // RGB
}

/// Request for rendering a vertical tile (full traces, specific sample range)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TileRequest {
    /// Starting trace index
    pub start_trace: usize,
    /// Number of traces to render (always full traces)
    pub trace_count: usize,
    /// Starting sample index for this tile
    pub start_sample: usize,
    /// Number of samples in this tile
    pub sample_count: usize,
    /// Output width in pixels
    pub output_width: u32,
    /// Output height in pixels
    pub output_height: u32,
    /// Colormap selection
    pub colormap_type: ColormapType,
    /// Amplitude normalization strategy
    pub scaling: AmplitudeScaling,
    /// Rendering mode
    pub render_mode: RenderMode,
    /// Optional wiggle overlay settings
    pub wiggle_config: Option<WiggleConfig>,
}

/// Rendered tile result with positioning metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderedTile {
    /// Starting sample index for this tile
    pub start_sample: usize,
    /// Number of samples in this tile
    pub sample_count: usize,
    /// The rendered image data
    pub image: RenderedImage,
}
