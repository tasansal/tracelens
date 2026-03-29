/**
 * Appearance settings panel for theme configuration.
 */
import type { ThemePreference } from '@/shared/api/tauri/settings';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';

const cardClassName =
  'rounded-[20px] border border-border bg-panel-strong p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';
const radioButtonClass = 'peer sr-only';
const radioLabelClass =
  'flex flex-col gap-2 rounded-[14px] border-2 border-border bg-panel-muted p-4 cursor-pointer transition-all duration-200 hover:border-accent/50 hover:bg-panel-strong peer-checked:border-accent peer-checked:bg-panel peer-checked:shadow-[0_0_20px_var(--accent-glow)]';

const themeOptions: Array<{
  value: ThemePreference;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    value: 'light',
    label: 'Light',
    description: 'Bright color scheme',
    icon: '☀️',
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Dark color scheme',
    icon: '🌙',
  },
  {
    value: 'system',
    label: 'System',
    description: 'Follow OS preference',
    icon: '💻',
  },
];

/**
 * Appearance settings component.
 *
 * @returns Theme selection cards with preview controls.
 */
export const AppearanceSettings = () => {
  const { appSettings, setTheme } = useSettingsStore();
  const [sliderValue, setSliderValue] = useState(15);

  if (!appSettings) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-text-muted">
        Loading appearance settings...
      </div>
    );
  }

  const currentTheme = appSettings.theme;

  const handleThemeChange = (theme: ThemePreference) => {
    setTheme(theme);
  };

  return (
    <div className="space-y-6 animate-[rise-in_0.35s_ease-out] motion-reduce:animate-none">
      <section className={cardClassName}>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Theme</h3>
          <p className="text-sm text-text-dim mt-1">
            Choose how TraceLens looks. System theme follows your operating system settings.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {themeOptions.map(option => (
            <div key={option.value}>
              <input
                type="radio"
                id={`theme-${option.value}`}
                name="theme"
                value={option.value}
                checked={currentTheme === option.value}
                onChange={() => handleThemeChange(option.value)}
                className={radioButtonClass}
              />
              <label htmlFor={`theme-${option.value}`} className={radioLabelClass}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{option.icon}</span>
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-text">{option.label}</span>
                    <p className="text-xs text-text-dim mt-0.5">{option.description}</p>
                  </div>
                </div>
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className={cardClassName}>
        <div className="mb-3">
          <h3 className="text-sm font-semibold">Preview</h3>
          <p className="text-xs text-text-dim mt-1">
            Preview your theme selection. Changes apply to all windows automatically.
          </p>
        </div>
        <div
          id="theme-preview-container"
          className="rounded-[12px] border border-border bg-panel p-3 space-y-3"
        >
          {/* Table preview */}
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border bg-panel-strong">
                  <TableHead>Field</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="border-b border-border hover:bg-[var(--row-hover)]">
                  <TableCell className="font-mono text-xs">sample_format</TableCell>
                  <TableCell className="text-text-muted">5 (IEEE Float)</TableCell>
                  <TableCell className="text-text-dim text-xs">int16</TableCell>
                </TableRow>
                <TableRow className="hover:bg-[var(--row-hover)]">
                  <TableCell className="font-mono text-xs">num_samples</TableCell>
                  <TableCell className="text-text-muted">1024</TableCell>
                  <TableCell className="text-text-dim text-xs">int16</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {/* Slider preview */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-panel-strong p-3">
            <input
              type="range"
              min={1}
              max={32}
              value={sliderValue}
              onChange={e => setSliderValue(parseInt(e.target.value, 10))}
              className="range-slider flex-1 h-1 w-full accent-accent"
            />
            <span className="min-w-[60px] text-right font-mono text-xs text-text-muted">
              {sliderValue} / 32
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};
