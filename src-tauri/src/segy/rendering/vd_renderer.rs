use super::{colormap::Colormap, normalizer, types::*};
use crate::segy::TraceData;
use image::{ImageBuffer, Rgb, RgbImage};
use rayon::prelude::*;

/// Render Variable Density image from traces
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

    // 5. Encode to specified format
    encode_image(img, ImageFormat::Png)
}

/// Encode image to specified format
fn encode_image(img: RgbImage, format: ImageFormat) -> Result<RenderedImage, String> {
    let (width, height) = img.dimensions();

    match format {
        ImageFormat::Png => {
            let mut png_bytes = Vec::new();
            img.write_to(
                &mut std::io::Cursor::new(&mut png_bytes),
                image::ImageFormat::Png,
            )
            .map_err(|e| format!("PNG encoding failed: {}", e))?;

            Ok(RenderedImage {
                width,
                height,
                data: png_bytes,
                format,
            })
        }
    }
}
