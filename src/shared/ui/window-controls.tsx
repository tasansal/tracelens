/**
 * Titlebar button trio (minimize / maximize / close) shared between the main
 * and settings windows. Renders nothing outside Tauri.
 *
 * The caller owns the enclosing titlebar and `data-tauri-drag-region` region;
 * this component only exposes the interactive buttons and marks itself as a
 * no-drag zone.
 */
import { cn } from '@/shared/utils/cn';
import { isTauri } from '@/shared/utils/tauri';
import { getCurrentWindow } from '@tauri-apps/api/window';
import toast from 'react-hot-toast';

const buttonClass =
  'inline-flex h-7 w-[30px] items-center justify-center rounded-[var(--radius-sm)] border border-border bg-panel-muted text-text transition duration-200 ease-out hover:border-transparent hover:bg-panel-strong active:translate-y-px motion-reduce:transition-none';
const closeButtonClass = cn(
  buttonClass,
  'hover:bg-[linear-gradient(130deg,var(--accent),var(--accent-3))] hover:text-accent-ink hover:shadow-[0_8px_18px_var(--accent-glow)]'
);

const svgProps = {
  className: 'h-3 w-3 stroke-current',
  viewBox: '0 0 12 12',
  fill: 'none' as const,
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
};

interface WindowControlsProps {
  /** Override the close handler — defaults to `appWindow.close()`. */
  onClose?: () => void | Promise<void>;
}

async function minimizeWindow() {
  try {
    await getCurrentWindow().minimize();
  } catch (error) {
    console.error('Failed to minimize window:', error);
    toast.error('Failed to minimize window');
  }
}

async function toggleMaximizeWindow() {
  try {
    const win = getCurrentWindow();
    if (await win.isMaximized()) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
  } catch (error) {
    console.error('Failed to toggle window maximize state:', error);
    toast.error('Failed to toggle window size');
  }
}

async function closeWindowDefault() {
  try {
    await getCurrentWindow().close();
  } catch (error) {
    console.error('Failed to close window:', error);
    toast.error('Failed to close window');
  }
}

export const WindowControls = ({ onClose }: WindowControlsProps = {}) => {
  if (!isTauri()) return null;

  return (
    <div className="inline-flex items-center gap-1.5 ml-1.5" data-tauri-drag-region="false">
      <button
        type="button"
        onClick={minimizeWindow}
        className={buttonClass}
        data-tauri-drag-region="false"
        aria-label="Minimize window"
      >
        <svg {...svgProps}>
          <path d="M2 6h8" />
        </svg>
      </button>
      <button
        type="button"
        onClick={toggleMaximizeWindow}
        className={buttonClass}
        data-tauri-drag-region="false"
        aria-label="Toggle maximize window"
      >
        <svg {...svgProps}>
          <rect x="2.25" y="2.25" width="7.5" height="7.5" rx="1" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => void (onClose ? onClose() : closeWindowDefault())}
        className={closeButtonClass}
        data-tauri-drag-region="false"
        aria-label="Close window"
      >
        <svg {...svgProps}>
          <path d="M3 3l6 6M9 3L3 9" />
        </svg>
      </button>
    </div>
  );
};
