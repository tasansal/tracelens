/**
 * Header bar with app branding, file actions, and quick SEG-Y metadata status.
 *
 * Typography (Task 4.2 final sweep): Defines `ghostButtonClass` (text-[12px] uppercase
 * tracking-[0.12em] + display-tight on titlebar "TraceLens" label) and `statusPillBase`
 * (text-[11px] text-text-muted) — both intentionally local chrome treatments (documented
 * exceptions in design-language.md; low ROI to extract). Titlebar identity uses the
 * canonical display-tight + tracking pattern (see SettingsApp for parallel "Settings").
 * Status pills for SEG-Y metadata are dense header chrome. Dropdown shortcuts use
 * shared DropdownMenuShortcut (.text-eyebrow). All per 4.2 rules + prior branding
 * cleanup chunk. No prose leaks. Final sweep confirms; see design doc for ghost vs
 * Button.ghost distinctions.
 */
import { formatByteOrder, formatTextEncoding } from '@/features/segy/types/segy';
import { openSettingsWindow } from '@/shared/api/tauri/settings';
import { useAppStore } from '@/shared/store/appStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { WindowControls } from '@/shared/ui/window-controls';
import { logoUrl } from '@/shared/utils/assets';
import { cn } from '@/shared/utils/cn';
import { isTauri } from '@/shared/utils/tauri';
import { useEffect, useEffectEvent } from 'react';
import toast from 'react-hot-toast';

const ghostButtonClass =
  'rounded-full border border-border px-3 py-1 text-[12px] uppercase tracking-[0.12em] text-text transition-colors duration-200 hover:border-transparent hover:bg-panel-muted motion-reduce:transition-none';
const statusPillBase =
  'inline-flex items-center rounded-full border border-border bg-panel-muted px-3 py-1 text-[11px] text-text-muted';
const statusDotClass =
  'h-1.5 w-1.5 rounded-full bg-accent-2 shadow-[0_0_12px_var(--accent-2-glow)]';

/**
 * Props for AppHeader component.
 */
interface AppHeaderProps {
  /** Callback to trigger file selection dialog */
  onFileSelect: () => void;
  /** Callback to trigger remote URI input dialog */
  onRemoteFileSelect: () => void;
  /** Callback to exit the application */
  onExit: () => void;
}

/**
 * Application header component with branding, file actions, and metadata status.
 * Includes window controls and keyboard shortcuts.
 *
 * @returns Rendered header bar with file menu, shortcuts, and window controls.
 */
export const AppHeader = ({ onFileSelect, onRemoteFileSelect, onExit }: AppHeaderProps) => {
  const { segyData } = useAppStore();
  const inTauri = isTauri();

  // Wrap callbacks as Effect Events so the keydown listener doesn't re-subscribe
  // every time the parent re-renders with fresh callback identities.
  const triggerLocalOpen = useEffectEvent(() => onFileSelect());
  const triggerRemoteOpen = useEffectEvent(() => onRemoteFileSelect());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'O') {
        e.preventDefault();
        triggerRemoteOpen();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        triggerLocalOpen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleOpenSettings = async () => {
    try {
      await openSettingsWindow();
    } catch (error) {
      console.error('Failed to open settings window:', error);
      toast.error('Failed to open settings window');
    }
  };

  return (
    <header
      className="sticky top-0 z-[200] relative overflow-visible border-b border-[var(--grid)] bg-panel-tint text-text select-none"
      data-tauri-drag-region
    >
      <div className="flex h-11 items-center justify-between px-4" data-tauri-drag-region>
        <div className="flex items-center gap-6" data-tauri-drag-region>
          <div className="flex items-center gap-3" data-tauri-drag-region>
            <img
              src={logoUrl}
              alt="TraceLens logo"
              className="size-8 rounded-[var(--radius-sm)] border border-border bg-panel-strong"
              data-tauri-drag-region
            />
            <span
              className="display-tight text-sm font-extrabold uppercase tracking-[0.2em] text-text"
              data-tauri-drag-region
            >
              TraceLens
            </span>
          </div>
          <nav className="flex items-center gap-2" data-tauri-drag-region>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button data-tauri-drag-region="false" className={ghostButtonClass}>
                  File
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={10}>
                <DropdownMenuItem
                  onSelect={() => {
                    onFileSelect();
                  }}
                >
                  <span className="font-semibold">Open Local File…</span>
                  <DropdownMenuShortcut>Ctrl+O</DropdownMenuShortcut>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onSelect={() => {
                    onRemoteFileSelect();
                  }}
                >
                  <span className="whitespace-nowrap font-semibold">Open Remote File…</span>
                  <DropdownMenuShortcut>Ctrl+Shift+O</DropdownMenuShortcut>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onSelect={() => {
                    onExit();
                  }}
                  className="text-accent"
                >
                  Exit Application
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {inTauri && (
              <button
                data-tauri-drag-region="false"
                className={ghostButtonClass}
                onClick={handleOpenSettings}
              >
                Settings
              </button>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-4" data-tauri-drag-region>
          {segyData && (
            <>
              {/* Full status bar for large screens */}
              <div
                className={cn(statusPillBase, 'hidden gap-1 lg:inline-flex')}
                data-tauri-drag-region
              >
                <div className="flex items-center gap-2" data-tauri-drag-region>
                  <span className={statusDotClass} data-tauri-drag-region></span>
                  {(segyData.file_size / 1024 / 1024).toFixed(2)} MB
                </div>
                <span className="text-border/60 mx-1 select-none" data-tauri-drag-region>
                  ·
                </span>
                <div data-tauri-drag-region>{segyData.total_traces ?? '?'} traces</div>
                <span className="text-border/60 mx-1 select-none" data-tauri-drag-region>
                  ·
                </span>
                <div data-tauri-drag-region>{formatTextEncoding(segyData.text_encoding)}</div>
                <span className="text-border/60 mx-1 select-none" data-tauri-drag-region>
                  ·
                </span>
                <div data-tauri-drag-region>{formatByteOrder(segyData.byte_order)}</div>
              </div>

              {/* Abbreviated status for mobile */}
              <div className={cn(statusPillBase, 'gap-1 lg:hidden')} data-tauri-drag-region>
                <span className={statusDotClass} data-tauri-drag-region></span>
                <div data-tauri-drag-region>{(segyData.file_size / 1024 / 1024).toFixed(1)} MB</div>
                <span className="text-border/60 mx-1 select-none" data-tauri-drag-region>
                  ·
                </span>
                <div data-tauri-drag-region>{segyData.total_traces ?? '?'} tr</div>
              </div>
            </>
          )}

          <WindowControls />
        </div>
      </div>
    </header>
  );
};
