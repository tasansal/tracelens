use super::types::*;
use crate::segy::TraceData;
use image::{Rgb, RgbImage};

/// Render wiggle traces
pub fn render_wiggle(
    traces: Vec<TraceData>,
    viewport: &ViewportConfig,
    wiggle_config: &WiggleConfig,
    normalized: &[Vec<f32>],
) -> Result<RgbImage, String> {
    let width = viewport.width;
    let height = viewport.height;
    let mut img = RgbImage::from_pixel(width, height, Rgb([255, 255, 255])); // White background

    let trace_count = traces.len();
    if trace_count == 0 || normalized.is_empty() {
        return Ok(img);
    }

    let samples_per_trace = normalized[0].len();
    if samples_per_trace == 0 {
        return Ok(img);
    }

    // Calculate pixel spacing
    let trace_spacing = width as f32 / trace_count as f32;
    let sample_spacing = height as f32 / samples_per_trace as f32;

    // Maximum wiggle amplitude in pixels (half of trace spacing)
    let max_wiggle_width = trace_spacing * 0.4;

    // Render each trace
    for (trace_idx, trace_data) in normalized.iter().enumerate() {
        let trace_center_x = (trace_idx as f32 + 0.5) * trace_spacing;

        // Draw wiggle trace
        for sample_idx in 0..samples_per_trace.saturating_sub(1) {
            let y1 = sample_idx as f32 * sample_spacing;
            let y2 = (sample_idx + 1) as f32 * sample_spacing;

            let amp1 = trace_data[sample_idx];
            let amp2 = trace_data[sample_idx + 1];

            let x1 = trace_center_x + amp1 * max_wiggle_width;
            let x2 = trace_center_x + amp2 * max_wiggle_width;

            // Draw line segment
            draw_line(
                &mut img,
                x1,
                y1,
                x2,
                y2,
                wiggle_config.line_color,
                wiggle_config.line_width,
            );

            // Fill positive/negative areas
            if wiggle_config.fill_positive && amp1 > 0.0 && amp2 > 0.0 {
                fill_polygon(
                    &mut img,
                    &[
                        (trace_center_x, y1),
                        (x1, y1),
                        (x2, y2),
                        (trace_center_x, y2),
                    ],
                    wiggle_config.positive_fill_color,
                );
            }

            if wiggle_config.fill_negative && amp1 < 0.0 && amp2 < 0.0 {
                fill_polygon(
                    &mut img,
                    &[
                        (trace_center_x, y1),
                        (x1, y1),
                        (x2, y2),
                        (trace_center_x, y2),
                    ],
                    wiggle_config.negative_fill_color,
                );
            }
        }
    }

    Ok(img)
}

/// Render combined wiggle + variable density
pub fn render_wiggle_vd(
    traces: Vec<TraceData>,
    viewport: &ViewportConfig,
    colormap: &dyn super::colormap::Colormap,
    wiggle_config: &WiggleConfig,
    normalized: &[Vec<f32>],
) -> Result<RgbImage, String> {
    // First render VD as base
    let mut img = render_vd_base(normalized, viewport, colormap)?;

    // Overlay wiggle traces
    let trace_count = traces.len();
    if trace_count == 0 || normalized.is_empty() {
        return Ok(img);
    }

    let samples_per_trace = normalized[0].len();
    if samples_per_trace == 0 {
        return Ok(img);
    }

    let trace_spacing = viewport.width as f32 / trace_count as f32;
    let sample_spacing = viewport.height as f32 / samples_per_trace as f32;
    let max_wiggle_width = trace_spacing * 0.3;

    // Render wiggle overlay
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

    Ok(img)
}

/// Render VD base image without encoding
fn render_vd_base(
    normalized: &[Vec<f32>],
    viewport: &ViewportConfig,
    colormap: &dyn super::colormap::Colormap,
) -> Result<RgbImage, String> {
    use image::ImageBuffer;
    use rayon::prelude::*;

    let width = normalized.len() as u32;
    let height = if !normalized.is_empty() {
        normalized[0].len() as u32
    } else {
        0
    };

    let mut img: RgbImage = ImageBuffer::new(width, height);

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
                *pixel = Rgb([0, 0, 0]);
            }
        });

    // Scale to output dimensions if needed
    if width != viewport.width || height != viewport.height {
        Ok(image::imageops::resize(
            &img,
            viewport.width,
            viewport.height,
            image::imageops::FilterType::Lanczos3,
        ))
    } else {
        Ok(img)
    }
}

/// Draw a line using Bresenham's algorithm
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

/// Fill a polygon (simple scanline algorithm for convex polygons)
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
