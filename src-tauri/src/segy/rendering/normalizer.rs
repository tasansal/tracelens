//! Amplitude normalization and gain control utilities.
//!
//! Normalization maps trace samples to a consistent range so rendering modes
//! can assume values in approximately [-1.0, 1.0].
//!
//! Global modes (percentile, fixed) divide every sample by a single pre-computed
//! clip value.  AGC computes a per-trace sliding-window gain.
//!
//! All normalization functions use `rayon` for parallel processing across traces,
//! providing significant speedup on multi-core systems.

use super::types::AmplitudeScaling;
use crate::segy::TraceData;
use rayon::prelude::*;

/// Normalize trace amplitudes to the [-1.0, 1.0] range.
///
/// # Parallelization
/// Uses `rayon::par_iter()` to process traces in parallel, automatically
/// utilizing available CPU cores. Each trace is converted and normalized
/// independently with no shared state.
pub fn normalize_traces(traces: &[TraceData], scaling: &AmplitudeScaling) -> Vec<Vec<f32>> {
    match scaling {
        AmplitudeScaling::GlobalPercentile { clip_value } => normalize_by_clip(traces, *clip_value),
        AmplitudeScaling::GlobalFixed { clip_value } => normalize_by_clip(traces, *clip_value),
        AmplitudeScaling::Agc { window_size } => normalize_agc(traces, *window_size),
    }
}

/// Global clip normalization: all traces scaled by the same clip value.
/// Values beyond ±clip are clamped to [-1, 1].
fn normalize_by_clip(traces: &[TraceData], clip_value: f32) -> Vec<Vec<f32>> {
    let clip = clip_value.max(1e-10); // avoid division by zero
    traces
        .par_iter()
        .map(|trace| {
            trace_to_f32_slice(trace)
                .iter()
                .map(|&v| (v / clip).clamp(-1.0, 1.0))
                .collect()
        })
        .collect()
}

/// AGC normalization: each trace independently normalized with a sliding window.
///
/// For tiled rendering the caller should supply traces that include context
/// samples around the tile boundaries (see `normalize_agc_with_context`).
fn normalize_agc(traces: &[TraceData], window_size: Option<usize>) -> Vec<Vec<f32>> {
    traces
        .par_iter()
        .map(|trace| {
            let samples = trace_to_f32_slice(trace);

            match window_size {
                Some(window) if window > 0 => apply_windowed_agc(&samples, window),
                _ => {
                    // Full-trace AGC: normalize by maximum amplitude
                    let max_abs = samples
                        .iter()
                        .map(|&v| v.abs())
                        .max_by(|a, b| a.partial_cmp(b).unwrap())
                        .unwrap_or(1.0)
                        .max(1e-10);

                    samples
                        .iter()
                        .map(|&v| (v / max_abs).clamp(-1.0, 1.0))
                        .collect()
                }
            }
        })
        .collect()
}

/// Normalize traces using AGC with extra context samples that extend beyond
/// the tile boundary.
///
/// Each element of `full_traces` contains the full sample range needed for
/// AGC context (i.e. the tile samples plus padding on both sides).
/// `context_before` is the number of extra samples prepended before the
/// tile's actual start.  The returned vectors contain only the tile's own
/// samples (length = full_trace_len - context_before - context_after), where
/// context_after is inferred.
pub fn normalize_agc_with_context(
    full_traces: &[TraceData],
    window_size: Option<usize>,
    context_before: usize,
    tile_sample_count: usize,
) -> Vec<Vec<f32>> {
    full_traces
        .par_iter()
        .map(|trace| {
            let samples = trace_to_f32_slice(trace);

            let normalized_full = match window_size {
                Some(window) if window > 0 => apply_windowed_agc(&samples, window),
                _ => {
                    let max_abs = samples
                        .iter()
                        .map(|&v| v.abs())
                        .max_by(|a, b| a.partial_cmp(b).unwrap())
                        .unwrap_or(1.0)
                        .max(1e-10);

                    samples
                        .iter()
                        .map(|&v| (v / max_abs).clamp(-1.0, 1.0))
                        .collect::<Vec<f32>>()
                }
            };

            // Trim to the tile's actual sample range
            let end = (context_before + tile_sample_count).min(normalized_full.len());
            normalized_full[context_before..end].to_vec()
        })
        .collect()
}

/// Apply windowed AGC normalization to a trace.
///
/// For each sample, computes the RMS (root mean square) amplitude in a window
/// centered on that sample, then normalizes by that local RMS value.
fn apply_windowed_agc(samples: &[f32], window_size: usize) -> Vec<f32> {
    let n = samples.len();
    let half_window = window_size / 2;
    let mut normalized = Vec::with_capacity(n);

    for i in 0..n {
        // Determine window bounds (clamped to array bounds)
        let start = i.saturating_sub(half_window);
        let end = (i + half_window + 1).min(n);

        // Compute RMS amplitude in the window
        let window_samples = &samples[start..end];
        let rms = compute_rms(window_samples);

        // Normalize by RMS (avoid division by zero)
        let gain = if rms > 1e-10 { 1.0 / rms } else { 1.0 };
        normalized.push(samples[i] * gain);
    }

    // Clamp to [-1, 1] to prevent extreme values
    normalized.iter().map(|&v| v.clamp(-1.0, 1.0)).collect()
}

/// Compute root mean square (RMS) of samples.
#[inline]
fn compute_rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 1.0;
    }

    let sum_squares: f32 = samples.iter().map(|&v| v * v).sum();
    (sum_squares / samples.len() as f32).sqrt()
}

/// Convert TraceData enum to an owned `Vec<f32>`.
///
/// This allocates a new buffer because trace data can be stored in multiple
/// concrete formats.
pub(crate) fn trace_to_f32_slice(trace: &TraceData) -> Vec<f32> {
    match trace {
        TraceData::IbmFloat32(samples) => samples.clone(),
        TraceData::IeeeFloat32(samples) => samples.clone(),
        TraceData::Int32(samples) => samples.iter().map(|&v| v as f32).collect(),
        TraceData::Int16(samples) => samples.iter().map(|&v| v as f32).collect(),
        TraceData::Int8(samples) => samples.iter().map(|&v| v as f32).collect(),
        TraceData::FixedPointWithGain(samples) => samples
            .iter()
            .map(|&(gain, value)| {
                let scale = 2.0_f32.powi(gain as i32);
                (value as f32) * scale
            })
            .collect(),
    }
}
