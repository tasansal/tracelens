//! Variable density renderer for SEG-Y traces.
//!
//! Variable density (VD) rendering maps trace amplitudes to colors, creating
//! a 2D heatmap visualization where x-axis represents trace number and y-axis
//! represents sample depth/time.

use super::{colormap::Colormap, encode_png_fast, normalizer, types::*};
use crate::segy::TraceData;
use image::{imageops::FilterType, Rgb, RgbImage};
use rayon::prelude::*;

/// Render a vertical tile with high-quality Lanczos3 interpolation.
///
/// This function is optimized for tiled rendering where:
/// - Full traces are always rendered (no horizontal tiling)
/// - Vertical tiling by sample ranges for progressive loading
/// - OPTIMIZED: Input traces contain ONLY the requested sample range (pre-filtered)
/// - ALWAYS uses Lanczos3 interpolation for scientific accuracy
///
/// # Arguments
/// * `traces` - Trace data containing ONLY the requested sample range (pre-filtered)
/// * `output_width` - Output image width in pixels
/// * `output_height` - Output image height in pixels
/// * `colormap` - Color mapping function
/// * `scaling` - Amplitude normalization strategy
///
/// # Returns
/// PNG-encoded tile image
pub fn render_tile(
    traces: Vec<TraceData>,
    output_width: u32,
    output_height: u32,
    colormap: &dyn Colormap,
    scaling: &AmplitudeScaling,
) -> Result<RenderedImage, String> {
    // 1. Normalize trace amplitudes (only operates on the tile sample range)
    let normalized = normalizer::normalize_traces(&traces, scaling);

    // 2. Render at native resolution (1 pixel per trace/sample)
    let native_width = traces.len() as u32;
    let native_height = if !normalized.is_empty() {
        normalized[0].len() as u32
    } else {
        0
    };

    if native_width == 0 || native_height == 0 {
        return Err("Cannot render empty trace set".to_string());
    }

    let mut native_img = RgbImage::new(native_width, native_height);

    native_img
        .enumerate_pixels_mut()
        .par_bridge()
        .for_each(|(x, y, pixel)| {
            let trace_idx = x as usize;
            let sample_idx = y as usize;

            if trace_idx < normalized.len() && sample_idx < normalized[trace_idx].len() {
                let amplitude = normalized[trace_idx][sample_idx];
                let rgb = colormap.to_rgb(amplitude);
                *pixel = Rgb(rgb);
            } else {
                *pixel = Rgb([0, 0, 0]); // Black for missing data
            }
        });

    // 3. Resize to output dimensions using ALWAYS Lanczos3 for high-quality output
    let resized_img = if native_width != output_width || native_height != output_height {
        image::imageops::resize(
            &native_img,
            output_width,
            output_height,
            FilterType::Lanczos3,
        )
    } else {
        native_img
    };

    // 4. Encode as PNG
    encode_png_fast(resized_img)
}

/// Render a tile from pre-normalized amplitude data (used for AGC with context).
///
/// This variant skips the normalization step because the caller has already
/// applied AGC with boundary context and trimmed the result.
///
/// # Arguments
/// * `normalized` - Pre-normalized amplitude data (one Vec<f32> per trace)
/// * `output_width` - Output image width in pixels
/// * `output_height` - Output image height in pixels
/// * `colormap` - Color mapping function
///
/// # Returns
/// PNG-encoded tile image
pub fn render_tile_from_normalized(
    normalized: Vec<Vec<f32>>,
    output_width: u32,
    output_height: u32,
    colormap: &dyn Colormap,
) -> Result<RenderedImage, String> {
    let native_width = normalized.len() as u32;
    let native_height = if !normalized.is_empty() {
        normalized[0].len() as u32
    } else {
        0
    };

    if native_width == 0 || native_height == 0 {
        return Err("Cannot render empty trace set".to_string());
    }

    let mut native_img = RgbImage::new(native_width, native_height);

    native_img
        .enumerate_pixels_mut()
        .par_bridge()
        .for_each(|(x, y, pixel)| {
            let trace_idx = x as usize;
            let sample_idx = y as usize;

            if trace_idx < normalized.len() && sample_idx < normalized[trace_idx].len() {
                let amplitude = normalized[trace_idx][sample_idx];
                let rgb = colormap.to_rgb(amplitude);
                *pixel = Rgb(rgb);
            } else {
                *pixel = Rgb([0, 0, 0]);
            }
        });

    let resized_img = if native_width != output_width || native_height != output_height {
        image::imageops::resize(
            &native_img,
            output_width,
            output_height,
            FilterType::Lanczos3,
        )
    } else {
        native_img
    };

    encode_png_fast(resized_img)
}
