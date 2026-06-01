/**
 * Empty-state panel shown when no SEG-Y file has been loaded.
 */
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/utils/cn';

/**
 * Props for SegyEmptyState component.
 */
interface SegyEmptyStateProps {
  /** Whether a file is currently being dragged over the drop zone */
  isDragActive: boolean;
  /** Callback fired when the user clicks to select a local file */
  onFileSelect: () => void;
  /** Callback fired when the user clicks to open a remote file */
  onRemoteFileSelect: () => void;
}

/** Decorative animated wiggle-trace SVG paths behind the card. */
const WiggleBackground = () => (
  <svg
    aria-hidden="true"
    className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.13]"
    preserveAspectRatio="xMidYMid slice"
    viewBox="0 0 800 400"
  >
    {[
      {
        d: 'M0 200 Q100 120 200 200 Q300 280 400 200 Q500 120 600 200 Q700 280 800 200',
        delay: '0s',
      },
      {
        d: 'M0 160 Q80 100 160 160 Q240 220 320 160 Q400 100 480 160 Q560 220 640 160 Q720 100 800 160',
        delay: '1s',
      },
      {
        d: 'M0 240 Q120 300 240 240 Q360 180 480 240 Q600 300 720 240 Q760 220 800 240',
        delay: '2s',
      },
      {
        d: 'M0 120 Q100 60 200 120 Q300 180 400 120 Q500 60 600 120 Q700 180 800 120',
        delay: '3s',
      },
      {
        d: 'M0 280 Q90 340 180 280 Q270 220 360 280 Q450 340 540 280 Q630 220 720 280 Q760 300 800 280',
        delay: '1.5s',
      },
    ].map(({ d, delay }) => (
      <path
        key={d}
        d={d}
        fill="none"
        stroke="var(--accent-2)"
        strokeWidth="1.5"
        style={{
          animation: `wiggle-breathe 6s ease-in-out infinite`,
          animationDelay: delay,
        }}
      />
    ))}
  </svg>
);

/**
 * Call-to-action card that prompts the user to open a SEG-Y file.
 * Displays a branded empty state with wiggle-trace background,
 * large display wordmark (artistic hero exception), and file selection buttons.
 *
 * The 56px "SEG-Y" watermark and 42px "TraceLens" wordmark use one-off large
 * display sizes/weights/tracking as a justified artistic treatment for the
 * emphasis hero panel (no mapping to .text-headline/.text-eyebrow utilities).
 * Composed with .display-tight for Syne features. See design-language.md §Typography.
 *
 * Typography (Task 4.2 final sweep): Hero exceptions documented here + in design doc
 * (branded empty state emphasis surface). kbd hints use .text-eyebrow (correct short
 * labels). Body prose uses text-[length:var(--text-sm,12px)] text-text-muted (proportional). Branding chunk
 * (prior 4.2) + this final sweep confirm clean; no other leaks. Ready for 4.3.
 *
 * @param props - Component props
 * @returns Empty state component
 */
export const SegyEmptyState = ({
  isDragActive,
  onFileSelect,
  onRemoteFileSelect,
}: SegyEmptyStateProps) => {
  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
      {/* Full-bleed wiggle background */}
      <WiggleBackground />

      {/* Card */}
      <div
        className={cn(
          'relative z-10 w-[min(540px,92%)] rounded-[var(--radius-xl)] border bg-panel/90 backdrop-blur-sm text-center shadow-[var(--shadow)] transition-all duration-300 ease-out motion-reduce:transition-none',
          isDragActive
            ? 'border-accent-2 border-dashed -translate-y-2 shadow-[0_0_60px_var(--accent-2-glow)]'
            : 'border-border animate-[rise-in_0.8s_ease-out] motion-reduce:animate-none'
        )}
      >
        {/* Wordmark hero — justified artistic exception (see JSDoc + design-language.md) */}
        <div className="px-8 pt-8 pb-4">
          <div
            className="display-tight text-[56px] font-black leading-none tracking-[-0.04em] text-text/[0.06]"
            aria-hidden="true"
          >
            SEG-Y
          </div>
          <div className="-mt-10 display-tight text-[42px] font-extrabold leading-none tracking-[-0.02em] text-text">
            TraceLens
          </div>
        </div>

        {/* Hairline divider */}
        <div className="mx-8 h-px bg-border" />

        {/* Body + CTAs */}
        <div className="px-8 pb-8 pt-5">
          <p className="text-[length:var(--text-sm,12px)] text-text-muted">
            {isDragActive
              ? 'Release to open this SEG-Y file'
              : 'Open a local file, drag & drop, or connect to remote SEG-Y data.'}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <div className="flex flex-col items-center gap-2">
              <Button onClick={onFileSelect}>
                {isDragActive ? 'Drop to Load' : 'Open Local File'}
              </Button>
              <div className="text-eyebrow">Ctrl+O</div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button variant="secondary" onClick={onRemoteFileSelect}>
                Open Remote
              </Button>
              <div className="text-eyebrow">Ctrl+Shift+O</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
