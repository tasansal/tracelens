//! Rendering helpers for variable density and wiggle displays.
//!
//! This module converts trace sample data into raster images using different
//! visualization modes and encodes the result as PNG for the frontend.

mod colormap;
pub mod normalizer;
pub mod types;
pub mod vd_renderer; // Make public for tile rendering
pub mod wiggle_renderer; // Make public for tile rendering

// Re-exports - only expose high-level rendering function and types
pub use types::*;

use base64::{Engine as _, engine::general_purpose};
use colormap::create_colormap;
use image::RgbImage;

/// Get a colormap instance by type (exposed for tile rendering)
pub fn get_colormap(colormap_type: ColormapType) -> Box<dyn colormap::Colormap> {
    create_colormap(colormap_type)
}

/// Encode an RGB image as PNG with fast compression and return base64-encoded data.
pub(crate) fn encode_png_fast(img: RgbImage) -> Result<RenderedImage, String> {
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

    let base64_data = general_purpose::STANDARD.encode(&png_bytes);

    Ok(RenderedImage {
        width,
        height,
        data: base64_data,
        format: ImageFormat::Png,
    })
}
