/**
 * Header bar with app branding, file actions, and quick SEG-Y metadata status.
 */
import { formatByteOrder, formatTextEncoding } from '@/features/segy/types/segy';
import { useAppStore } from '@/shared/store/appStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { getCurrentWindow } from '@tauri-apps/api/window';
import React from 'react';

const logoUrl = new URL('../../../src-tauri/icons/64x64.png', import.meta.url).toString();
const ghostButtonClass =
  'rounded-full border border-border px-3 py-1.5 text-[12px] uppercase tracking-[0.12em] text-text transition-colors duration-200 hover:border-transparent hover:bg-panel-muted motion-reduce:transition-none';
const statusPillBase =
  'inline-flex items-center rounded-full border border-border bg-panel-muted px-3 py-1.5 text-[11px] text-text-muted';
const statusDotClass =
  'h-1.5 w-1.5 rounded-full bg-accent-2 shadow-[0_0_12px_var(--accent-2-glow)]';
const titlebarButtonClass =
  'inline-flex h-7 w-[30px] items-center justify-center rounded-lg border border-border bg-panel-muted text-text transition duration-200 ease-out hover:border-transparent hover:bg-panel-strong active:translate-y-px motion-reduce:transition-none';
const titlebarCloseButtonClass = `${titlebarButtonClass} hover:bg-[linear-gradient(130deg,var(--accent),var(--accent-3))] hover:text-accent-ink hover:shadow-[0_8px_18px_var(--accent-glow)]`;

/**
 * Props for AppHeader actions.
 */
export const AppHeader: React.FC<{
  onFileSelect: () => void;
  onExit: () => void;
}> = ({ onFileSelect, onExit }) => {
  const appWindow = getCurrentWindow();
  const { segyData } = useAppStore();

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        onFileSelect();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onFileSelect]);

  const toggleMaximize = async () => {
    const isMaximized = await appWindow.isMaximized();
    if (isMaximized) {
      await appWindow.unmaximize();
      return;
    }
    await appWindow.maximize();
  };

  return (
    <header
      className="sticky top-0 z-[200] relative overflow-visible border-b border-[var(--grid)] bg-panel-tint text-text select-none"
      data-tauri-drag-region
    >
      <div className="flex h-16 items-center justify-between px-4" data-tauri-drag-region>
        <div className="flex items-center gap-6" data-tauri-drag-region>
          <div className="flex items-center gap-3" data-tauri-drag-region>
            <img
              src={logoUrl}
              alt="TraceLens logo"
              className="h-8 w-8 rounded-md border border-border bg-panel-strong"
              data-tauri-drag-region
            />
            <div className="flex flex-col leading-none" data-tauri-drag-region>
              <span
                className="text-sm font-extrabold uppercase tracking-[0.2em] text-text"
                data-tauri-drag-region
              >
                TraceLens
              </span>
              <span
                className="text-[10px] uppercase tracking-[0.24em] text-text-dim"
                data-tauri-drag-region
              >
                SEG-Y Workbench
              </span>
            </div>
          </div>
          <nav className="flex items-center gap-2" data-tauri-drag-region>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button data-tauri-drag-region="false" className={ghostButtonClass}>
                  File
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={10} className="w-60">
                <DropdownMenuItem
                  onSelect={() => {
                    onFileSelect();
                  }}
                >
                  <span className="font-semibold">Open SEG-Y...</span>
                  <DropdownMenuShortcut>Ctrl+O</DropdownMenuShortcut>
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
          </nav>
        </div>

        <div className="flex items-center gap-4" data-tauri-drag-region>
          {segyData && (
            <>
              {/* Full status bar for large screens */}
              <div
                className={`${statusPillBase} hidden gap-4 lg:inline-flex`}
                data-tauri-drag-region
              >
                <div className="flex items-center gap-2" data-tauri-drag-region>
                  <span className={statusDotClass} data-tauri-drag-region></span>
                  {(segyData.file_size / 1024 / 1024).toFixed(2)} MB
                </div>
                <div className="h-3 w-px bg-border" data-tauri-drag-region></div>
                <div data-tauri-drag-region>{segyData.total_traces ?? '?'} traces</div>
                <div className="h-3 w-px bg-border" data-tauri-drag-region></div>
                <div data-tauri-drag-region>{formatTextEncoding(segyData.text_encoding)}</div>
                <div className="h-3 w-px bg-border" data-tauri-drag-region></div>
                <div data-tauri-drag-region>{formatByteOrder(segyData.byte_order)}</div>
              </div>

              {/* Abbreviated status for mobile */}
              <div className={`${statusPillBase} gap-2 lg:hidden`} data-tauri-drag-region>
                <span className={statusDotClass} data-tauri-drag-region></span>
                <div data-tauri-drag-region>{(segyData.file_size / 1024 / 1024).toFixed(1)} MB</div>
                <div className="h-3 w-px bg-border" data-tauri-drag-region></div>
                <div data-tauri-drag-region>{segyData.total_traces ?? '?'} tr</div>
              </div>
            </>
          )}

          <div className="inline-flex items-center gap-1.5 ml-1.5" data-tauri-drag-region="false">
            <button
              type="button"
              onClick={() => {
                void appWindow.minimize();
              }}
              className={titlebarButtonClass}
              data-tauri-drag-region="false"
              aria-label="Minimize window"
            >
              <svg
                className="h-3 w-3 stroke-current"
                viewBox="0 0 12 12"
                fill="none"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 6h8"></path>
              </svg>
            </button>
            <button
              type="button"
              onClick={async () => {
                await toggleMaximize();
              }}
              className={titlebarButtonClass}
              data-tauri-drag-region="false"
              aria-label="Toggle maximize window"
            >
              <svg
                className="h-3 w-3 stroke-current"
                viewBox="0 0 12 12"
                fill="none"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="2.25" y="2.25" width="7.5" height="7.5" rx="1"></rect>
              </svg>
            </button>
            <button
              type="button"
              onClick={() => {
                void appWindow.close();
              }}
              className={titlebarCloseButtonClass}
              data-tauri-drag-region="false"
              aria-label="Close window"
            >
              <svg
                className="h-3 w-3 stroke-current"
                viewBox="0 0 12 12"
                fill="none"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 3l6 6M9 3L3 9"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
