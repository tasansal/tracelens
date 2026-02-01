//! Variable density renderer for SEG-Y traces.
//!
//! Variable density (VD) rendering maps trace amplitudes to colors, creating
//! a 2D heatmap visualization where x-axis represents trace number and y-axis
//! represents sample depth/time.

use super::{colormap::Colormap, encode_png_fast, normalizer, types::*};
use crate::segy::TraceData;
use image::{ImageBuffer, Rgb, RgbImage};
use rayon::prelude::*;

/// Render a variable density image from normalized traces.
///
/// # Arguments
/// * `traces` - Raw trace data to be normalized and rendered
/// * `viewport` - Output dimensions and trace range
/// * `colormap` - Color mapping function for amplitudes
/// * `scaling` - Normalization strategy
///
/// # Returns
/// PNG-encoded image with variable density visualization
///
/// # Parallelization
/// Uses `rayon::par_bridge()` to parallelize pixel generation across all CPU cores.
/// Each pixel is computed independently, allowing near-linear speedup.
pub fn render_variable_density(
    traces: Vec<TraceData>,
    viewport: &ViewportConfig,
    colormap: &dyn Colormap,
    scaling: &AmplitudeScaling,
) -> Result<RenderedImage, String> {
    // 1. Normalize amplitudes
    let normalized = normalizer::normalize_traces(&traces, scaling);

    // 2. Create image buffer - always use full trace height
    let width = viewport.trace_count as u32;
    let height = if !normalized.is_empty() {
        normalized[0].len() as u32
    } else {
        0
    };
    let mut img: RgbImage = ImageBuffer::new(width, height);

    // 3. Parallel pixel generation
    img.enumerate_pixels_mut()
        .par_bridge()
        .for_each(|(x, y, pixel)| {
            let trace_idx = x as usize;
            let sample_idx = y as usize;

            if trace_idx < normalized.len() && sample_idx < normalized[trace_idx].len() {
                let amplitude = normalized[trace_idx][sample_idx];
                let rgb = colormap.to_rgb(amplitude);
                *pixel = Rgb(rgb);
            } else {
                *pixel = Rgb([0, 0, 0]); // Black for out-of-bounds
            }
        });

    // 4. Scale to output dimensions if needed
    let img = if width != viewport.width || height != viewport.height {
        image::imageops::resize(
            &img,
            viewport.width,
            viewport.height,
            image::imageops::FilterType::Lanczos3,
        )
    } else {
        img
    };

    // 5. Encode with fast PNG settings
    encode_png_fast(img)
}
