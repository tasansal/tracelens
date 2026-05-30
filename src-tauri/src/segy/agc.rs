//! Automatic Gain Control (AGC) for trace samples.
//!
//! AGC normalizes each trace along the sample (time) axis by dividing every
//! sample by the local RMS amplitude in a sliding window. Because the window
//! can span more samples than a single render tile covers, the gain is computed
//! from the **full trace** (which the chunk cache already holds) and only the
//! requested sample sub-range is returned. This keeps render tiles independent
//! while still producing seam-free gain across vertical tile boundaries.
//!
//! The window is specified in milliseconds at the IPC boundary ([`AgcOptions`])
//! and resolved to a sample count ([`AgcSpec`]) using the file's sample
//! interval. A `None` window means full-trace AGC (one gain per trace).

use serde::Deserialize;

/// AGC parameters as received from the frontend.
///
/// `window_ms` is the AGC window length in milliseconds; `None` requests
/// full-trace AGC (a single gain computed over the entire trace).
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgcOptions {
    pub window_ms: Option<f64>,
}

/// Resolved AGC parameters in sample units.
///
/// `window_samples` is the window length in samples; `None` means full-trace.
#[derive(Debug, Clone, Copy)]
pub struct AgcSpec {
    pub window_samples: Option<usize>,
}

/// Convert millisecond AGC options into a sample-based spec.
///
/// A non-positive window or an unknown/invalid sample interval falls back to
/// full-trace AGC, so callers never produce a zero-length window.
pub fn resolve(opts: AgcOptions, sample_interval_us: i16) -> AgcSpec {
    let window_samples = opts.window_ms.and_then(|ms| {
        if ms > 0.0 && sample_interval_us > 0 {
            let samples = (ms * 1000.0 / f64::from(sample_interval_us)).round();
            if samples >= 1.0 {
                Some(samples as usize)
            } else {
                Some(1)
            }
        } else {
            None
        }
    });
    AgcSpec { window_samples }
}

/// Apply AGC to a full trace, returning the normalized samples for the
/// half-open output range `[out_start, out_start + out_len)`.
///
/// The output is always `out_len` long, zero-padded where the requested range
/// extends past the trace. Gain is `1 / rms`; dead (all-zero) windows produce a
/// gain of 0 so silent regions stay silent rather than amplifying to noise.
pub fn apply_agc(full: &[f32], out_start: usize, out_len: usize, spec: &AgcSpec) -> Vec<f32> {
    let n = full.len();
    let mut out = vec![0.0f32; out_len];
    if n == 0 {
        return out;
    }

    match spec.window_samples {
        // Full-trace AGC: a single gain for the whole trace.
        None => {
            let sumsq: f64 = full.iter().map(|&v| f64::from(v) * f64::from(v)).sum();
            let gain = gain_from_rms((sumsq / n as f64).sqrt());
            for (i, slot) in out.iter_mut().enumerate() {
                let src = out_start + i;
                if src < n {
                    *slot = full[src] * gain;
                }
            }
        }
        // Windowed AGC: per-sample gain from a centered window. A prefix sum of
        // squares makes each window's energy an O(1) lookup, so the whole pass
        // is O(n) regardless of window length.
        Some(window) => {
            let half = window.max(1) / 2;
            let mut prefix = vec![0.0f64; n + 1];
            for (k, &v) in full.iter().enumerate() {
                prefix[k + 1] = prefix[k] + f64::from(v) * f64::from(v);
            }
            for (i, slot) in out.iter_mut().enumerate() {
                let src = out_start + i;
                if src >= n {
                    break;
                }
                let lo = src.saturating_sub(half);
                // window - half gives the right-side extent so the actual span
                // is exactly `window` samples for both odd and even windows.
                // (half + 1 would yield window + 1 for even window sizes.)
                let hi = (src + window - half).min(n);
                let count = (hi - lo) as f64;
                let rms = ((prefix[hi] - prefix[lo]) / count).sqrt();
                *slot = full[src] * gain_from_rms(rms);
            }
        }
    }

    out
}

/// Gain from an RMS value: `1 / rms`, clamped to 0 for dead or overflowing
/// windows so the output never contains infinities or NaNs.
fn gain_from_rms(rms: f64) -> f32 {
    if rms <= 0.0 {
        return 0.0;
    }
    let gain = (1.0 / rms) as f32;
    if gain.is_finite() { gain } else { 0.0 }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_full_trace_when_no_window() {
        let spec = resolve(AgcOptions { window_ms: None }, 2000);
        assert_eq!(spec.window_samples, None);
    }

    #[test]
    fn resolve_converts_ms_to_samples() {
        // 4 ms at 2000 µs/sample = 2 samples.
        let spec = resolve(
            AgcOptions {
                window_ms: Some(4.0),
            },
            2000,
        );
        assert_eq!(spec.window_samples, Some(2));
    }

    #[test]
    fn resolve_falls_back_to_full_trace_for_bad_interval() {
        assert_eq!(
            resolve(
                AgcOptions {
                    window_ms: Some(10.0)
                },
                0
            )
            .window_samples,
            None
        );
        assert_eq!(
            resolve(
                AgcOptions {
                    window_ms: Some(0.0)
                },
                2000
            )
            .window_samples,
            None
        );
    }

    #[test]
    fn resolve_clamps_tiny_window_to_one_sample() {
        // 0.1 ms at 2000 µs/sample rounds to 0 → clamped to 1.
        let spec = resolve(
            AgcOptions {
                window_ms: Some(0.1),
            },
            2000,
        );
        assert_eq!(spec.window_samples, Some(1));
    }

    #[test]
    fn full_trace_normalizes_constant_to_unit() {
        let full = vec![2.0f32; 8];
        let out = apply_agc(
            &full,
            0,
            8,
            &AgcSpec {
                window_samples: None,
            },
        );
        for v in out {
            assert!((v - 1.0).abs() < 1e-6, "expected ~1.0, got {v}");
        }
    }

    #[test]
    fn dead_trace_stays_zero() {
        let full = vec![0.0f32; 8];
        let out = apply_agc(
            &full,
            0,
            8,
            &AgcSpec {
                window_samples: Some(4),
            },
        );
        assert!(out.iter().all(|&v| v == 0.0));
    }

    #[test]
    fn output_is_zero_padded_past_trace_end() {
        let full = vec![1.0f32; 4];
        let out = apply_agc(
            &full,
            2,
            6,
            &AgcSpec {
                window_samples: None,
            },
        );
        assert_eq!(out.len(), 6);
        // out[i] maps to src = out_start + i: out[0],out[1] -> src 2,3 (exist);
        // out[2..6] -> src 4..8 (past the 4-sample trace) -> zero-padded.
        assert!(out[0] != 0.0 && out[1] != 0.0);
        assert!(out[2..].iter().all(|&v| v == 0.0));
    }

    #[test]
    fn windowed_gain_tracks_local_amplitude() {
        // Quiet region then loud region: AGC should pull both toward unit RMS,
        // so the normalized quiet samples are amplified relative to raw.
        let mut full = vec![0.5f32; 16];
        for v in full.iter_mut().take(8) {
            *v = 0.05;
        }
        let out = apply_agc(
            &full,
            0,
            16,
            &AgcSpec {
                window_samples: Some(4),
            },
        );
        // Quiet sample magnitude after AGC should exceed its raw value.
        assert!(out[2].abs() > 0.05);
        // All outputs finite.
        assert!(out.iter().all(|v| v.is_finite()));
    }
}
