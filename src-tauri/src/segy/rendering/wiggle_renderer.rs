//! Wiggle trace renderer and composite rendering helpers.
//!
//! This module implements wiggle trace rendering using Bresenham's line algorithm
//! and scanline polygon filling. Wiggle traces show amplitude variations as
//! oscillations around a central axis, optionally filling positive/negative lobes.

use super::types::*;
use image::{Rgb, RgbImage};

/// Draw a line using Bresenham's algorithm.
///
/// # Arguments
/// * `img` - Target image buffer
/// * `x0, y0` - Start coordinates
/// * `x1, y1` - End coordinates
/// * `color` - RGB line color
/// * `width` - Line width in pixels (uses circular brush for width > 1.0)
///
/// # Algorithm
/// For thin lines (width ≤ 1.0), uses standard Bresenham line drawing.
/// For thick lines, applies a circular brush at each Bresenham point.
fn draw_line(img: &mut RgbImage, x0: f32, y0: f32, x1: f32, y1: f32, color: [u8; 3], width: f32) {
    let (img_width, img_height) = img.dimensions();
    let x0 = x0.round() as i32;
    let y0 = y0.round() as i32;
    let x1 = x1.round() as i32;
    let y1 = y1.round() as i32;

    let dx = (x1 - x0).abs();
    let dy = (y1 - y0).abs();
    let sx = if x0 < x1 { 1 } else { -1 };
    let sy = if y0 < y1 { 1 } else { -1 };
    let mut err = dx - dy;

    let mut x = x0;
    let mut y = y0;

    // For thin lines (< 1.0), just draw single pixels
    if width <= 1.0 {
        loop {
            if x >= 0 && x < img_width as i32 && y >= 0 && y < img_height as i32 {
                img.put_pixel(x as u32, y as u32, Rgb(color));
            }

            if x == x1 && y == y1 {
                break;
            }

            let e2 = 2 * err;
            if e2 > -dy {
                err -= dy;
                x += sx;
            }
            if e2 < dx {
                err += dx;
                y += sy;
            }
        }
    } else {
        // For thick lines, use circular brush for better quality
        let radius = (width / 2.0) as i32;
        let radius_sq = radius * radius;

        loop {
            // Draw circular brush instead of square
            for dx in -radius..=radius {
                let dx_sq = dx * dx;
                for dy in -radius..=radius {
                    // Only draw pixels within circular radius
                    if dx_sq + dy * dy <= radius_sq {
                        let px = x + dx;
                        let py = y + dy;
                        if px >= 0 && px < img_width as i32 && py >= 0 && py < img_height as i32 {
                            img.put_pixel(px as u32, py as u32, Rgb(color));
                        }
                    }
                }
            }

            if x == x1 && y == y1 {
                break;
            }

            let e2 = 2 * err;
            if e2 > -dy {
                err -= dy;
                x += sx;
            }
            if e2 < dx {
                err += dx;
                y += sy;
            }
        }
    }
}

/// Fill the positive or negative lobe section of a single sample-to-sample segment.
///
/// When a segment crosses zero, this computes the crossing point and fills only
/// the signed sub-segment so lobe edges connect cleanly to the trace centerline.
struct LobeSegment {
    trace_center_x: f32,
    y1: f32,
    y2: f32,
    amp1: f32,
    amp2: f32,
    max_wiggle_width: f32,
}

fn fill_signed_lobe_segment(
    img: &mut RgbImage,
    segment: &LobeSegment,
    is_positive: bool,
    color: [u8; 3],
) {
    let (signed_amp1, signed_amp2) = if is_positive {
        (segment.amp1, segment.amp2)
    } else {
        (-segment.amp1, -segment.amp2)
    };

    if signed_amp1 <= 0.0 && signed_amp2 <= 0.0 {
        return;
    }

    let (t_start, t_end) = if signed_amp1 > 0.0 && signed_amp2 > 0.0 {
        (0.0, 1.0)
    } else {
        let denom = signed_amp1 - signed_amp2;
        if denom.abs() <= f32::EPSILON {
            return;
        }

        let t_cross = (signed_amp1 / denom).clamp(0.0, 1.0);
        if signed_amp1 > 0.0 {
            (0.0, t_cross)
        } else {
            (t_cross, 1.0)
        }
    };

    if (t_end - t_start).abs() <= f32::EPSILON {
        return;
    }

    let y_delta = segment.y2 - segment.y1;
    let y_start = segment.y1 + y_delta * t_start;
    let y_end = segment.y1 + y_delta * t_end;

    let amp_delta = segment.amp2 - segment.amp1;
    let amp_start = segment.amp1 + amp_delta * t_start;
    let amp_end = segment.amp1 + amp_delta * t_end;

    let x_start = segment.trace_center_x + amp_start * segment.max_wiggle_width;
    let x_end = segment.trace_center_x + amp_end * segment.max_wiggle_width;

    fill_polygon(
        img,
        &[
            (segment.trace_center_x, y_start),
            (x_start, y_start),
            (x_end, y_end),
            (segment.trace_center_x, y_end),
        ],
        color,
    );
}

/// Fill a polygon using a scanline algorithm.
///
/// # Arguments
/// * `img` - Target image buffer
/// * `points` - Polygon vertices as (x, y) pairs
/// * `color` - RGB fill color
///
/// # Algorithm
/// Uses horizontal scanline filling:
/// 1. Compute bounding box of polygon
/// 2. For each scanline (y coordinate):
///    - Find intersections with polygon edges
///    - Sort intersections by x coordinate
///    - Fill between pairs of intersections
///
/// Optimized for small convex quadrilaterals (typical wiggle fill case).
fn fill_polygon(img: &mut RgbImage, points: &[(f32, f32)], color: [u8; 3]) {
    if points.len() < 3 {
        return;
    }

    let (img_width, img_height) = img.dimensions();

    // Find bounding box
    let min_y = points
        .iter()
        .map(|(_, y)| *y)
        .fold(f32::INFINITY, f32::min)
        .floor() as i32;
    let max_y = points
        .iter()
        .map(|(_, y)| *y)
        .fold(f32::NEG_INFINITY, f32::max)
        .ceil() as i32;

    // Pre-allocate for typical polygon (convex quadrilateral has max 2 intersections per scanline)
    let mut intersections = Vec::with_capacity(4);

    // Scanline fill
    for y in min_y.max(0)..=max_y.min(img_height as i32 - 1) {
        intersections.clear();

        // Find intersections with polygon edges
        for i in 0..points.len() {
            let (x1, y1) = points[i];
            let (x2, y2) = points[(i + 1) % points.len()];
            let y_f32 = y as f32;

            if (y1 <= y_f32 && y_f32 < y2) || (y2 <= y_f32 && y_f32 < y1) {
                let x = x1 + (y_f32 - y1) * (x2 - x1) / (y2 - y1);
                intersections.push(x);
            }
        }

        intersections.sort_by(|a, b| a.partial_cmp(b).unwrap());

        // Fill between pairs of intersections
        for i in (0..intersections.len()).step_by(2) {
            if i + 1 < intersections.len() {
                let x_start = intersections[i].ceil() as i32;
                let x_end = intersections[i + 1].floor() as i32;

                for x in x_start.max(0)..=x_end.min(img_width as i32 - 1) {
                    img.put_pixel(x as u32, y as u32, Rgb(color));
                }
            }
        }
    }
}

/// Render a wiggle tile directly at output dimensions.
///
/// This function renders wiggle traces directly at the requested output size,
/// using the actual pixel dimensions to calculate proper trace spacing and amplitude.
///
/// # Arguments
/// * `normalized` - Pre-normalized trace data in [-1.0, 1.0] range
/// * `output_width` - Output image width in pixels
/// * `output_height` - Output image height in pixels
/// * `wiggle_config` - Rendering configuration (colors, fill options, line width)
///
/// # Returns
/// PNG-encoded tile image
pub fn render_wiggle_tile(
    normalized: Vec<Vec<f32>>,
    output_width: u32,
    output_height: u32,
    wiggle_config: &WiggleConfig,
) -> Result<super::RenderedImage, String> {
    let trace_count = normalized.len();
    let samples_per_trace = if !normalized.is_empty() {
        normalized[0].len()
    } else {
        0
    };

    if trace_count == 0 || samples_per_trace == 0 {
        return Err("Cannot render empty trace set".to_string());
    }

    // Render directly at output dimensions
    let mut img = RgbImage::from_pixel(output_width, output_height, Rgb([255, 255, 255]));

    // Calculate pixel spacing based on output dimensions
    let trace_spacing = output_width as f32 / trace_count as f32;
    let sample_spacing = output_height as f32 / samples_per_trace as f32;
    let max_wiggle_width = trace_spacing * 0.4;

    // Render each trace
    for (trace_idx, trace_data) in normalized.iter().enumerate() {
        let trace_center_x = (trace_idx as f32 + 0.5) * trace_spacing;

        for sample_idx in 0..samples_per_trace.saturating_sub(1) {
            let y1 = sample_idx as f32 * sample_spacing;
            let y2 = (sample_idx + 1) as f32 * sample_spacing;

            let amp1 = trace_data[sample_idx];
            let amp2 = trace_data[sample_idx + 1];

            let x1 = trace_center_x + amp1 * max_wiggle_width;
            let x2 = trace_center_x + amp2 * max_wiggle_width;
            let lobe_segment = LobeSegment {
                trace_center_x,
                y1,
                y2,
                amp1,
                amp2,
                max_wiggle_width,
            };

            draw_line(
                &mut img,
                x1,
                y1,
                x2,
                y2,
                wiggle_config.line_color,
                wiggle_config.line_width,
            );

            if wiggle_config.fill_positive {
                fill_signed_lobe_segment(
                    &mut img,
                    &lobe_segment,
                    true,
                    wiggle_config.positive_fill_color,
                );
            }

            if wiggle_config.fill_negative {
                fill_signed_lobe_segment(
                    &mut img,
                    &lobe_segment,
                    false,
                    wiggle_config.negative_fill_color,
                );
            }
        }
    }

    super::encode_png_fast(img)
}

/// Render a combined wiggle + variable density tile directly at output dimensions.
///
/// # Arguments
/// * `normalized` - Pre-normalized trace data in [-1.0, 1.0] range
/// * `output_width` - Output image width in pixels
/// * `output_height` - Output image height in pixels
/// * `colormap` - Color mapping function for VD background
/// * `wiggle_config` - Rendering configuration for wiggle overlay
///
/// # Returns
/// PNG-encoded tile image
pub fn render_wiggle_vd_tile(
    normalized: Vec<Vec<f32>>,
    output_width: u32,
    output_height: u32,
    colormap: &dyn super::colormap::Colormap,
    wiggle_config: &WiggleConfig,
) -> Result<super::RenderedImage, String> {
    use image::ImageBuffer;
    use rayon::prelude::*;

    let trace_count = normalized.len();
    let samples_per_trace = if !normalized.is_empty() {
        normalized[0].len()
    } else {
        0
    };

    if trace_count == 0 || samples_per_trace == 0 {
        return Err("Cannot render empty trace set".to_string());
    }

    // First render VD base at native resolution for quality
    let native_width = trace_count as u32;
    let native_height = samples_per_trace as u32;
    let mut vd_img: RgbImage = ImageBuffer::new(native_width, native_height);

    vd_img
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

    // Resize VD base to output dimensions with Lanczos3
    let mut img = if native_width != output_width || native_height != output_height {
        image::imageops::resize(
            &vd_img,
            output_width,
            output_height,
            image::imageops::FilterType::Lanczos3,
        )
    } else {
        vd_img
    };

    // Overlay wiggle traces at output dimensions
    let trace_spacing = output_width as f32 / trace_count as f32;
    let sample_spacing = output_height as f32 / samples_per_trace as f32;
    let max_wiggle_width = trace_spacing * 0.3;

    for (trace_idx, trace_data) in normalized.iter().enumerate() {
        let trace_center_x = (trace_idx as f32 + 0.5) * trace_spacing;

        for sample_idx in 0..samples_per_trace.saturating_sub(1) {
            let y1 = sample_idx as f32 * sample_spacing;
            let y2 = (sample_idx + 1) as f32 * sample_spacing;

            let amp1 = trace_data[sample_idx];
            let amp2 = trace_data[sample_idx + 1];

            let x1 = trace_center_x + amp1 * max_wiggle_width;
            let x2 = trace_center_x + amp2 * max_wiggle_width;

            draw_line(
                &mut img,
                x1,
                y1,
                x2,
                y2,
                wiggle_config.line_color,
                wiggle_config.line_width,
            );
        }
    }

    super::encode_png_fast(img)
}
