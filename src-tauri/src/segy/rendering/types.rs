//! Data types shared by the rendering pipeline and frontend.

use serde::{Deserialize, Serialize};

/// Viewport configuration for rendering
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewportConfig {
    /// Starting trace index (0-based)
    pub start_trace: usize,
    /// Number of traces to render
    pub trace_count: usize,
    /// Output image width in pixels
    pub width: u32,
    /// Output image height in pixels
    pub height: u32,
}

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

/// Amplitude scaling strategies
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum AmplitudeScaling {
    /// Scale all traces by global maximum
    Global {
        #[serde(rename = "maxAmplitude")]
        max_amplitude: f32,
    },
    /// Per-trace AGC (Automatic Gain Control)
    PerTrace {
        #[serde(rename = "windowSize")]
        window_size: Option<usize>,
    },
    /// Percentile clipping (robust to outliers)
    Percentile { percentile: f32 },
    /// Manual scale factor
    Manual { scale: f32 },
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
    /// Image data (format depends on `format` field)
    pub data: Vec<u8>,
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

/// Complete rendering configuration combining all rendering parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderConfig {
    /// Viewport sizing and trace range.
    pub viewport: ViewportConfig,
    /// Colormap selection for variable density rendering.
    pub colormap_type: ColormapType,
    /// Amplitude normalization strategy.
    pub scaling: AmplitudeScaling,
    /// Rendering mode selection.
    pub render_mode: RenderMode,
    /// Optional wiggle overlay settings.
    pub wiggle_config: Option<WiggleConfig>,
}
