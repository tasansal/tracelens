/**
 * Header bar with app branding, file actions, and quick SEG-Y metadata status.
 */
import { formatByteOrder, formatTextEncoding } from '@/features/segy/types/segy';
import { useAppStore } from '@/store/appStore';
import React from 'react';
import { createPortal } from 'react-dom';

const menuItems = [{ id: 'file', label: 'File', disabled: false }];
const logoUrl = new URL('../../../src-tauri/icons/64x64.png', import.meta.url).toString();

/**
 * Props for AppHeader actions.
 */
export const AppHeader: React.FC<{
  onFileSelect: () => void;
  onExit: () => void;
}> = ({ onFileSelect, onExit }) => {
  const { segyData, isLoading, isDarkMode } = useAppStore();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [menuPosition, setMenuPosition] = React.useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  /**
   * Position the dropdown menu relative to the File button with viewport clamping.
   */
  const updateMenuPosition = React.useCallback(() => {
    const button = menuButtonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = 240;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const top = rect.bottom + 10;
    setMenuPosition({ top, left, width });
  }, []);

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

  // Click outside to close menu
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isMenuOpen]);

  React.useEffect(() => {
    if (!isMenuOpen) return;
    const handleReposition = () => updateMenuPosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    handleReposition();
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isMenuOpen, updateMenuPosition]);

  const toggleMenu = () => {
    if (isMenuOpen) {
      setIsMenuOpen(false);
      return;
    }
    updateMenuPosition();
    setIsMenuOpen(true);
  };

  return (
    <header className="app-header sticky top-0 z-[200] bg-panel-tint text-text relative overflow-visible">
      <div className="flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <img
              src={logoUrl}
              alt="TraceLens logo"
              className="h-8 w-8 rounded-md border border-border bg-panel-strong"
            />
            <div className="flex flex-col leading-none">
              <span className="brand-mark text-sm">TraceLens</span>
              <span className="brand-subtitle">SEG-Y Workbench</span>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            {menuItems.map(item => (
              <button
                key={item.id}
                ref={item.id === 'file' ? menuButtonRef : undefined}
                onClick={() => item.id === 'file' && toggleMenu()}
                disabled={item.disabled}
                className="btn-ghost"
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {segyData && (
            <>
              {/* Full status bar for large screens */}
              <div className="status-pill hidden items-center gap-4 lg:flex">
                <div className="flex items-center gap-2">
                  <span className="status-dot"></span>
                  {(segyData.file_size / 1024 / 1024).toFixed(2)} MB
                </div>
                <div className="h-3 w-px bg-border"></div>
                <div>{segyData.total_traces ?? '?'} traces</div>
                <div className="h-3 w-px bg-border"></div>
                <div>{formatTextEncoding(segyData.text_encoding)}</div>
                <div className="h-3 w-px bg-border"></div>
                <div>{formatByteOrder(segyData.byte_order)}</div>
              </div>

              {/* Abbreviated status for mobile */}
              <div className="status-pill flex items-center gap-2 lg:hidden">
                <span className="status-dot"></span>
                <div>{(segyData.file_size / 1024 / 1024).toFixed(1)} MB</div>
                <div className="h-3 w-px bg-border"></div>
                <div>{segyData.total_traces ?? '?'} tr</div>
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onFileSelect}
              disabled={isLoading}
              className="btn-primary ml-2 text-sm"
            >
              {isLoading ? 'Loading...' : 'Open SEG-Y'}
            </button>
          </div>
        </div>
      </div>

      {/* Modern Menu Overlay */}
      {isMenuOpen &&
        menuPosition &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            className={`shadow-panel fixed z-[999] overflow-hidden rounded-xl border border-border bg-panel text-text ${
              isDarkMode ? 'theme-dark' : 'theme-light'
            }`}
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              width: menuPosition.width,
            }}
          >
            <div className="p-1.5">
              <button
                onClick={() => {
                  onFileSelect();
                  setIsMenuOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-strong transition-colors hover:bg-panel-strong"
              >
                <span className="font-semibold">Open SEG-Y...</span>
                <span className="ml-auto text-[10px] text-dim">Ctrl+O</span>
              </button>

              <div className="my-1.5 border-t border-border"></div>

              <button
                onClick={() => {
                  onExit();
                  setIsMenuOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-accent transition-colors hover:bg-panel-strong"
              >
                <span>Exit Application</span>
              </button>
            </div>
          </div>,
          document.body
        )}
    </header>
  );
};
