//! Rendering helpers for variable density and wiggle displays.
//!
//! This module converts trace sample data into raster images using different
//! visualization modes and encodes the result as PNG for the frontend.

pub mod colormap;
pub mod normalizer;
pub mod types;
pub mod vd_renderer;
pub mod wiggle_renderer;

// Re-exports
pub use colormap::create_colormap;
pub use normalizer::normalize_traces;
pub use types::*;
pub use vd_renderer::render_variable_density;
pub use wiggle_renderer::{render_wiggle, render_wiggle_vd};

use crate::segy::TraceData;
use image::RgbImage;

/// Render traces for a given mode and encode the result as PNG bytes.
pub fn render_traces(
    traces: Vec<TraceData>,
    viewport: &ViewportConfig,
    colormap_type: ColormapType,
    scaling: &AmplitudeScaling,
    render_mode: RenderMode,
    wiggle_config: Option<WiggleConfig>,
) -> Result<RenderedImage, String> {
    match render_mode {
        RenderMode::VariableDensity => {
            let colormap = create_colormap(colormap_type);
            render_variable_density(traces, viewport, colormap.as_ref(), scaling)
        }
        RenderMode::Wiggle => {
            let normalized = normalize_traces(&traces, scaling);
            let config = wiggle_config.unwrap_or_else(|| default_wiggle_config(RenderMode::Wiggle));
            let img = render_wiggle(viewport, &config, &normalized)?;
            encode_png_fast(img)
        }
        RenderMode::WiggleVariableDensity => {
            let normalized = normalize_traces(&traces, scaling);
            let colormap = create_colormap(colormap_type);
            let config = wiggle_config
                .unwrap_or_else(|| default_wiggle_config(RenderMode::WiggleVariableDensity));
            let img = render_wiggle_vd(viewport, colormap.as_ref(), &config, &normalized)?;
            encode_png_fast(img)
        }
    }
}

/// Encode an RGB image as PNG with fast compression settings.
pub fn encode_png_fast(img: RgbImage) -> Result<RenderedImage, String> {
    let (width, height) = img.dimensions();
    let raw_pixels = img.into_raw();

    let mut png_bytes = Vec::with_capacity((width * height * 3) as usize);
    let mut encoder = png::Encoder::new(std::io::Cursor::new(&mut png_bytes), width, height);
    encoder.set_color(png::ColorType::Rgb);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_compression(png::Compression::Fast);

    let mut writer = encoder
        .write_header()
        .map_err(|e| format!("PNG header write failed: {}", e))?;

    writer
        .write_image_data(&raw_pixels)
        .map_err(|e| format!("PNG encoding failed: {}", e))?;

    // Ensure the encoder flushes before returning the bytes.
    drop(writer);

    Ok(RenderedImage {
        width,
        height,
        data: png_bytes,
        format: ImageFormat::Png,
    })
}

/// Provide a default wiggle configuration tuned per render mode.
fn default_wiggle_config(render_mode: RenderMode) -> WiggleConfig {
    match render_mode {
        RenderMode::Wiggle => WiggleConfig {
            line_width: 1.0,
            line_color: [0, 0, 0],
            fill_positive: true,
            fill_negative: false,
            positive_fill_color: [0, 0, 0],
            negative_fill_color: [255, 0, 0],
        },
        RenderMode::WiggleVariableDensity => WiggleConfig {
            line_width: 1.0,
            line_color: [0, 0, 0],
            fill_positive: false,
            fill_negative: false,
            positive_fill_color: [0, 0, 0],
            negative_fill_color: [255, 0, 0],
        },
        RenderMode::VariableDensity => WiggleConfig {
            line_width: 1.0,
            line_color: [0, 0, 0],
            fill_positive: false,
            fill_negative: false,
            positive_fill_color: [0, 0, 0],
            negative_fill_color: [255, 0, 0],
        },
    }
}
