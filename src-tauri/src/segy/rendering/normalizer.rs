use super::types::AmplitudeScaling;
use crate::segy::TraceData;
use rayon::prelude::*;

/// Normalize trace amplitudes to [-1.0, 1.0] range
pub fn normalize_traces(traces: &[TraceData], scaling: &AmplitudeScaling) -> Vec<Vec<f32>> {
    match scaling {
        AmplitudeScaling::Global { max_amplitude } => normalize_global(traces, *max_amplitude),
        AmplitudeScaling::PerTrace { window_size } => normalize_per_trace(traces, *window_size),
        AmplitudeScaling::Percentile { percentile } => normalize_percentile(traces, *percentile),
        AmplitudeScaling::Manual { scale } => normalize_manual(traces, *scale),
    }
}

/// Global normalization: all traces scaled by same factor
fn normalize_global(traces: &[TraceData], max_amplitude: f32) -> Vec<Vec<f32>> {
    traces
        .par_iter()
        .map(|trace| {
            trace_to_f32_slice(trace)
                .iter()
                .map(|&v| v / max_amplitude)
                .collect()
        })
        .collect()
}

/// Per-trace AGC: each trace independently normalized
fn normalize_per_trace(traces: &[TraceData], window_size: Option<usize>) -> Vec<Vec<f32>> {
    traces
        .par_iter()
        .map(|trace| {
            let samples = trace_to_f32_slice(trace);

            match window_size {
                Some(window) if window > 0 => {
                    // Windowed AGC: sliding window normalization
                    apply_windowed_agc(&samples, window)
                }
                _ => {
                    // Full-trace AGC: normalize by maximum amplitude
                    let max_abs = samples
                        .iter()
                        .map(|&v| v.abs())
                        .max_by(|a, b| a.partial_cmp(b).unwrap())
                        .unwrap_or(1.0);

                    samples.iter().map(|&v| v / max_abs).collect()
                }
            }
        })
        .collect()
}

/// Apply windowed AGC normalization to a trace
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

/// Compute root mean square (RMS) of samples
#[inline]
fn compute_rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 1.0;
    }

    let sum_squares: f32 = samples.iter().map(|&v| v * v).sum();
    (sum_squares / samples.len() as f32).sqrt()
}

/// Percentile clipping: robust to outliers (computed globally across all traces)
fn normalize_percentile(traces: &[TraceData], percentile: f32) -> Vec<Vec<f32>> {
    // Collect all samples from all traces
    let all_samples: Vec<f32> = traces.iter().flat_map(trace_to_f32_slice).collect();

    // Sort by absolute value to find the percentile
    let mut sorted: Vec<f32> = all_samples.iter().map(|&v| v.abs()).collect();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());

    // Find the percentile value
    let idx = ((sorted.len() as f32) * percentile).min((sorted.len() - 1) as f32) as usize;
    let p_value = sorted.get(idx).copied().unwrap_or(1.0).max(1e-10); // Avoid division by zero

    // Normalize all traces using the global percentile value
    traces
        .par_iter()
        .map(|trace| {
            trace_to_f32_slice(trace)
                .iter()
                .map(|&v| (v / p_value).clamp(-1.0, 1.0))
                .collect()
        })
        .collect()
}

/// Manual scaling
fn normalize_manual(traces: &[TraceData], scale: f32) -> Vec<Vec<f32>> {
    traces
        .par_iter()
        .map(|trace| {
            trace_to_f32_slice(trace)
                .iter()
                .map(|&v| v * scale)
                .collect()
        })
        .collect()
}

/// Convert TraceData enum to f32 slice
fn trace_to_f32_slice(trace: &TraceData) -> Vec<f32> {
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
