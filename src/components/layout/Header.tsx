import { useAppStore } from '@/store.ts';
import { formatByteOrder, formatTextEncoding } from '@/types/segy.ts';
import React from 'react';

const menuItems = [{ id: 'file', label: 'File', disabled: false }];

export const Header: React.FC<{
  onFileSelect: () => void;
  onExit: () => void;
}> = ({ onFileSelect, onExit }) => {
  const { isDarkMode, segyData, isLoading } = useAppStore();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

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

  return (
    <header
      className={`border-b transition-colors duration-200 ${
        isDarkMode
          ? 'border-gray-800 bg-gray-900/80 text-white backdrop-blur-md'
          : 'border-gray-200 bg-white/80 text-gray-900 backdrop-blur-md'
      } sticky top-0 z-40`}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-1">
            {menuItems.map(item => (
              <button
                key={item.id}
                onClick={() => item.id === 'file' && setIsMenuOpen(!isMenuOpen)}
                disabled={item.disabled}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  item.disabled
                    ? isDarkMode
                      ? 'text-gray-400'
                      : 'text-gray-500'
                    : isDarkMode
                      ? 'hover:bg-gray-800'
                      : 'hover:bg-gray-100'
                }`}
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
              <div
                className={`hidden items-center gap-4 rounded-full border px-4 py-1.5 text-xs font-medium lg:flex ${
                  isDarkMode
                    ? 'border-gray-700 bg-gray-800/50 text-gray-400'
                    : 'border-gray-200 bg-gray-50 text-gray-500'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                  {(segyData.file_size / 1024 / 1024).toFixed(2)} MB
                </div>
                <div className="h-3 w-px bg-gray-600"></div>
                <div>{segyData.total_traces ?? '?'} traces</div>
                <div className="h-3 w-px bg-gray-600"></div>
                <div>{formatTextEncoding(segyData.text_encoding)}</div>
                <div className="h-3 w-px bg-gray-600"></div>
                <div>{formatByteOrder(segyData.byte_order)}</div>
              </div>

              {/* Abbreviated status for mobile */}
              <div
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium lg:hidden ${
                  isDarkMode
                    ? 'border-gray-700 bg-gray-800/50 text-gray-400'
                    : 'border-gray-200 bg-gray-50 text-gray-500'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                <div>{(segyData.file_size / 1024 / 1024).toFixed(1)} MB</div>
                <div className="h-3 w-px bg-gray-600"></div>
                <div>{segyData.total_traces ?? '?'} tr</div>
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onFileSelect}
              disabled={isLoading}
              className="ml-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-50"
            >
              {isLoading ? 'Loading...' : 'Open SEG-Y'}
            </button>
          </div>
        </div>
      </div>

      {/* Modern Menu Overlay */}
      {isMenuOpen && (
        <div
          ref={menuRef}
          className={`absolute top-14 left-4 z-50 w-56 overflow-hidden rounded-xl border shadow-2xl ${
            isDarkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'
          }`}
        >
          <div className="p-1.5">
            <button
              onClick={() => {
                onFileSelect();
                setIsMenuOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isDarkMode ? 'text-gray-200 hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span className="text-lg">📂</span>
              <span>Open SEG-Y...</span>
              <span
                className={`ml-auto text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}
              >
                Ctrl+O
              </span>
            </button>

            <div
              className={`my-1.5 border-t ${isDarkMode ? 'border-gray-800' : 'border-gray-100'}`}
            ></div>

            <button
              onClick={() => {
                onExit();
                setIsMenuOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <span className="text-lg">🚪</span>
              <span>Exit Application</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
