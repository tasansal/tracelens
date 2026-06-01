import { useEffect, useRef, type RefObject } from 'react';
import {
  checkDecay,
  classifyDevice,
  classifyIntent,
  DECAY_WINDOW,
  extractMagnitude,
  MOUSE_DELTA_THRESHOLD,
  normalizeDelta,
  type ClassifiedGesture,
} from './gestureClassifier';

const SAMPLING_MIN_EVENTS = 3;
const SAMPLING_MAX_MS = 100;
// Maximum gap between events before a gesture is considered ended. Active
// trackpad gestures fire events every ~16–50ms; mouse scroll detents and
// pinch-after-fingers-lift have gaps well above this. 200ms cleanly separates
// continuous gestures from discrete ones without interrupting either.
const IDLE_TIMEOUT_MS = 200;

type SamplingPhase = {
  name: 'sampling';
  samples: Array<{ dx: number; dy: number }>;
  hasCtrl: boolean;
  shiftKey: boolean;
  altKey: boolean;
  sumDx: number;
  sumDy: number;
  anchor: { x: number; y: number };
  lastEvent: WheelEvent;
  timer: ReturnType<typeof setTimeout>;
};

type ClassifiedPhase = {
  name: 'classified';
  gesture: ClassifiedGesture;
  recentMagnitudes: number[];
  lastEventAt: number;
};

type Phase = { name: 'idle' } | SamplingPhase | ClassifiedPhase;

/**
 * Attaches a wheel event listener to the canvas and classifies wheel gestures.
 *
 * The state machine has three phases:
 *
 *   - IDLE: no gesture in flight. Large deltas (mouse) are classified and acted
 *     on immediately, returning to IDLE so each detent re-reads modifier keys.
 *     Small deltas (trackpad) transition to SAMPLING for axis/device detection.
 *
 *   - SAMPLING: accumulates up to SAMPLING_MIN_EVENTS or SAMPLING_MAX_MS to
 *     determine device and intent. Used only for continuous trackpad-style
 *     event streams.
 *
 *   - CLASSIFIED: gesture intent locked. Each subsequent event fires onGesture
 *     with the locked intent. Exits to IDLE on either delta-decay (inertia
 *     events fading) or on a long event gap (gesture ended without inertia,
 *     e.g. pinch).
 *
 * `onGesture` is stable-ref'd internally — callers may pass inline functions.
 */
export function useGestureClassifier(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  onGesture: (gesture: ClassifiedGesture, event: WheelEvent) => void,
  disabled = false
): void {
  const onGestureRef = useRef(onGesture);
  useEffect(() => {
    onGestureRef.current = onGesture;
  });

  useEffect(() => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let phase: Phase = { name: 'idle' };

    const doClassify = (sampling: SamplingPhase): ClassifiedGesture => {
      const hasOtherModifier = sampling.shiftKey || sampling.altKey;
      const device = classifyDevice(sampling.samples, sampling.hasCtrl, hasOtherModifier);
      const intent = classifyIntent(
        device,
        { shiftKey: sampling.shiftKey, altKey: sampling.altKey },
        sampling.sumDx,
        sampling.sumDy
      );
      return { intent, device, anchor: sampling.anchor };
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const { dx, dy } = normalizeDelta(e);
      const rect = canvas.getBoundingClientRect();
      const cursorPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const ctrlOrMeta = e.ctrlKey || e.metaKey;
      const now = Date.now();

      // Time-based gesture-end detection. CLASSIFIED gestures normally exit via
      // delta-decay (inertia events fading below threshold). But mouse detents
      // and trackpad pinch end abruptly with no decay tail — without this check
      // the gesture would stay locked indefinitely and ignore later modifier
      // changes. A long gap means the previous gesture ended; treat the next
      // event as a new gesture.
      if (phase.name === 'classified' && now - phase.lastEventAt > IDLE_TIMEOUT_MS) {
        phase = { name: 'idle' };
      }

      switch (phase.name) {
        case 'idle': {
          const mag = Math.abs(dx) + Math.abs(dy);

          if (mag >= MOUSE_DELTA_THRESHOLD) {
            // Large delta = discrete mouse detent. Classify and fire per-event,
            // staying in IDLE so each subsequent detent re-reads modifier keys.
            // Mouse detents are independent events, not a continuous gesture —
            // locking into CLASSIFIED would freeze modifier handling.
            const device = ctrlOrMeta ? 'mouse-ctrl' : 'mouse-scroll';
            const intent = classifyIntent(device, { shiftKey: e.shiftKey, altKey: e.altKey }, 0, 0);
            const gesture: ClassifiedGesture = { intent, device, anchor: cursorPos };
            onGestureRef.current(gesture, e);
            // phase stays { name: 'idle' }
          } else {
            // Small delta = trackpad gesture. Enter SAMPLING to determine axis/
            // device from accumulated initial events.
            const timer = setTimeout(() => {
              if (phase.name === 'sampling') {
                const sampling = phase;
                const gesture = doClassify(sampling);
                phase = {
                  name: 'classified',
                  gesture,
                  recentMagnitudes: [],
                  lastEventAt: Date.now(),
                };
                // Fire the classified action for the event that completed the
                // sampling window — otherwise this scroll input is silently
                // consumed with no visible effect.
                onGestureRef.current(gesture, sampling.lastEvent);
              }
            }, SAMPLING_MAX_MS);

            phase = {
              name: 'sampling',
              samples: [{ dx, dy }],
              hasCtrl: ctrlOrMeta,
              shiftKey: e.shiftKey,
              altKey: e.altKey,
              sumDx: dx,
              sumDy: dy,
              anchor: cursorPos,
              lastEvent: e,
              timer,
            };
          }
          break;
        }

        case 'sampling': {
          phase.samples.push({ dx, dy });
          phase.hasCtrl = phase.hasCtrl || ctrlOrMeta;
          phase.sumDx += dx;
          phase.sumDy += dy;
          phase.lastEvent = e;

          if (phase.samples.length >= SAMPLING_MIN_EVENTS) {
            clearTimeout(phase.timer);
            const gesture = doClassify(phase);
            phase = {
              name: 'classified',
              gesture,
              recentMagnitudes: [],
              lastEventAt: now,
            };
            // Fire onGesture for the event that triggered classification —
            // otherwise the 3rd event of every trackpad gesture is silently
            // consumed.
            onGestureRef.current(gesture, e);
          }
          break;
        }

        case 'classified': {
          const mag = Math.abs(extractMagnitude(e));
          phase.recentMagnitudes.push(mag);
          if (phase.recentMagnitudes.length > DECAY_WINDOW * 2) {
            phase.recentMagnitudes.splice(0, phase.recentMagnitudes.length - DECAY_WINDOW * 2);
          }
          phase.lastEventAt = now;

          if (checkDecay(phase.recentMagnitudes)) {
            phase = { name: 'idle' };
            return;
          }

          onGestureRef.current(phase.gesture, e);
          break;
        }
      }
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      if (phase.name === 'sampling') clearTimeout(phase.timer);
      phase = { name: 'idle' };
    };
  }, [canvasRef, disabled]);
}
