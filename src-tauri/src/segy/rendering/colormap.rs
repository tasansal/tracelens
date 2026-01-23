//! Colormap implementations for variable density rendering.

use super::types::ColormapType;

/// Trait for colormap implementations.
pub trait Colormap: Send + Sync {
    /// Convert normalized amplitude [-1.0, 1.0] to an RGB color.
    fn to_rgb(&self, normalized_amplitude: f32) -> [u8; 3];
}

/// Seismic colormap: Red (negative) → White (zero) → Blue (positive)
pub struct SeismicColormap;

impl Colormap for SeismicColormap {
    fn to_rgb(&self, normalized: f32) -> [u8; 3] {
        // Clamp to [-1, 1]
        let clamped = normalized.clamp(-1.0, 1.0);

        if clamped < 0.0 {
            // Negative: Red → White
            let t = clamped + 1.0; // Map [-1, 0] → [0, 1]
            let r = 255;
            let g = (255.0 * t) as u8;
            let b = (255.0 * t) as u8;
            [r, g, b]
        } else {
            // Positive: White → Blue
            let t = clamped; // Map [0, 1] → [0, 1]
            let r = (255.0 * (1.0 - t)) as u8;
            let g = (255.0 * (1.0 - t)) as u8;
            let b = 255;
            [r, g, b]
        }
    }
}

/// Grayscale colormap
pub struct GrayscaleColormap {
    inverted: bool,
}

impl GrayscaleColormap {
    /// Create a grayscale colormap, optionally inverted.
    pub fn new(inverted: bool) -> Self {
        Self { inverted }
    }
}

impl Colormap for GrayscaleColormap {
    fn to_rgb(&self, normalized: f32) -> [u8; 3] {
        // Map [-1, 1] → [0, 255]
        let clamped = normalized.clamp(-1.0, 1.0);
        let mapped = ((clamped + 1.0) * 127.5) as u8;

        let value = if self.inverted { 255 - mapped } else { mapped };
        [value, value, value]
    }
}

/// Viridis colormap using colorgrad crate
pub struct ViridisColormap {
    gradient: Box<dyn colorgrad::Gradient + Send + Sync>,
}

impl Default for ViridisColormap {
    fn default() -> Self {
        Self::new()
    }
}

impl ViridisColormap {
    /// Create a viridis colormap from the preset gradient.
    pub fn new() -> Self {
        Self {
            gradient: Box::new(colorgrad::preset::viridis()),
        }
    }
}

impl Colormap for ViridisColormap {
    fn to_rgb(&self, normalized: f32) -> [u8; 3] {
        // Map [-1, 1] → [0, 1]
        let clamped = normalized.clamp(-1.0, 1.0);
        let t = (clamped + 1.0) / 2.0;

        let color = self.gradient.at(t);
        let [r, g, b, _] = color.to_rgba8();
        [r, g, b]
    }
}

/// Factory function to create a colormap from a public enum.
pub fn create_colormap(colormap_type: ColormapType) -> Box<dyn Colormap> {
    match colormap_type {
        ColormapType::Seismic => Box::new(SeismicColormap),
        ColormapType::Grayscale => Box::new(GrayscaleColormap::new(false)),
        ColormapType::GrayscaleInverted => Box::new(GrayscaleColormap::new(true)),
        ColormapType::Viridis => Box::new(ViridisColormap::new()),
    }
}
