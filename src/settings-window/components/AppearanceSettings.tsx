/**
 * Appearance settings panel for theme configuration.
 *
 * Typography (Task 4.2 final sweep): Per design-language.md, theme descriptions
 * and notes use proportional `text-sm text-text-dim` / `text-xs text-text-dim`
 * (never mono/eyebrow on prose). Table keys for header examples use explicit
 * `font-mono text-[length:var(--text-xs,10px)]` (correct limited use for technical identifiers). Preview
 * sample uses standard. Fully compliant with 4.2-mono (cited as "Good (settings / forms)"
 * example). No text-[Npx] leaks. Audited clean in final sweep.
 */
import {
  updateAppSettings,
  type ThemePreference,
  type UiDensity,
} from '@/shared/api/tauri/settings';
import { Button } from '@/shared/ui/button';
import { cardClassName } from '@/shared/ui/card';
import { OptionTile } from '@/shared/ui/option-tile';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { applyDensityClass } from '@/shared/utils/density';
import { applyThemeClass, resolveThemeIsDark } from '@/shared/utils/theme';
import { Maximize2, Minimize2, Rows } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';

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

const densityOptions: Array<{
  value: UiDensity;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: 'compact',
    label: 'Compact',
    description: 'Maximum information density. Best for power users who want to see more at once.',
    Icon: Minimize2,
  },
  {
    value: 'standard',
    label: 'Standard',
    description: 'Balanced text and spacing. Easier on the eyes while staying productive.',
    Icon: Rows,
  },
  {
    value: 'spacious',
    label: 'Spacious',
    description: 'Larger text and more breathing room. Good for long sessions or presentations.',
    Icon: Maximize2,
  },
];

/**
 * Appearance settings component.
 *
 * @returns Theme selection cards with preview controls.
 */
export const AppearanceSettings = () => {
  const { appSettings, setTheme, setDensity } = useSettingsStore();
  const [sliderValue, setSliderValue] = useState(15);

  // Local draft for theme selection — only affects the preview until the user applies.
  const [draftTheme, setDraftTheme] = useState<ThemePreference>('system');

  // Local draft for density (power-user UI scaling preset).
  const [draftDensity, setDraftDensity] = useState<UiDensity>('compact');

  // Keep draft in sync when the real saved value changes (e.g. external update or after apply).
  useEffect(() => {
    if (appSettings) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-way sync of local draft from external persisted settings (standard controlled draft pattern)
      setDraftTheme(appSettings.theme);
      setDraftDensity(appSettings.density);
    }
  }, [appSettings]);

  // Apply draft theme + draft density only to the local preview container (never the real document).
  // This lets the preview area demonstrate the chosen density's text/spacing scaling live
  // before the user hits Apply (which commits to global + both windows).
  useEffect(() => {
    const preview = document.getElementById('theme-preview-container');
    if (preview) {
      applyThemeClass(preview, resolveThemeIsDark(draftTheme));
      applyDensityClass(preview, draftDensity);
    }
  }, [draftTheme, draftDensity]);

  if (!appSettings) {
    return (
      <div className="flex items-center justify-center py-12 text-[length:var(--text-sm,12px)] text-text-muted">
        Loading appearance settings…
      </div>
    );
  }

  const currentTheme = appSettings.theme;
  const currentDensity = appSettings.density;
  const hasPendingChange = draftTheme !== currentTheme || draftDensity !== currentDensity;

  const handleApply = () => {
    if (hasPendingChange) {
      if (draftTheme !== currentTheme) {
        setTheme(draftTheme);
      }
      if (draftDensity !== currentDensity) {
        setDensity(draftDensity);
      }
      // Persist immediately so closing the window within the auto-save debounce
      // window doesn't silently discard the change.
      void updateAppSettings({ ...appSettings, theme: draftTheme, density: draftDensity });
    }
  };

  return (
    <div className="space-y-6 animate-[rise-in_0.35s_ease-out] motion-reduce:animate-none">
      <section className={cardClassName}>
        <div className="mb-[var(--space-4)]">
          <h3 className="text-[length:var(--text-base,13px)] font-semibold">Theme</h3>
          <p className="text-[length:var(--text-sm,12px)] text-text-dim mt-[var(--space-1)]">
            Choose how TraceLens looks. System theme follows your operating system settings.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-[var(--space-3)] md:grid-cols-3">
          {themeOptions.map(option => (
            <OptionTile
              key={option.value}
              selected={draftTheme === option.value}
              onClick={() => setDraftTheme(option.value)}
              aria-label={`${option.label} — ${option.description}`}
            >
              <div className="flex items-center gap-[var(--space-3)]">
                <span className="text-2xl">{option.icon}</span>
                <div className="flex-1">
                  <span className="text-[length:var(--text-sm,12px)] font-semibold text-text">
                    {option.label}
                  </span>
                  <p className="text-[length:var(--text-xs,10px)] text-text-dim mt-[var(--space-1)]">
                    {option.description}
                  </p>
                </div>
              </div>
            </OptionTile>
          ))}
        </div>
      </section>

      {/* Density preset control — one global control affecting text + spacing in both windows */}
      <section className={cardClassName}>
        <div className="mb-[var(--space-4)]">
          <h3 className="text-[length:var(--text-base,13px)] font-semibold">Interface Density</h3>
          <p className="text-[length:var(--text-sm,12px)] text-text-dim mt-[var(--space-1)]">
            Choose how compact or spacious the entire app feels. Affects all text sizes and spacing.
            Compact is the classic power-user optimized view.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-[var(--space-3)] md:grid-cols-3">
          {densityOptions.map(option => (
            <OptionTile
              key={option.value}
              selected={draftDensity === option.value}
              onClick={() => setDraftDensity(option.value)}
              aria-label={`${option.label} — ${option.description}`}
            >
              <div className="flex items-center gap-[var(--space-3)]">
                <option.Icon className="size-6 shrink-0 text-text-dim" />
                <div className="flex-1">
                  <span className="text-[length:var(--text-sm,12px)] font-semibold text-text">
                    {option.label}
                  </span>
                  <p className="text-[length:var(--text-xs,10px)] text-text-dim mt-[var(--space-1)]">
                    {option.description}
                  </p>
                </div>
              </div>
            </OptionTile>
          ))}
        </div>
      </section>

      <section className={cardClassName}>
        <div className="mb-[var(--space-3)] flex items-center justify-between">
          <div>
            <h3 className="text-[length:var(--text-sm,12px)] font-semibold">Preview</h3>
            <p className="text-[length:var(--text-xs,10px)] text-text-dim mt-[var(--space-1)]">
              Theme and draft Density preview live in the box below (global + other window after
              Apply). Density scales all text sizes and spacing.
            </p>
          </div>
          {hasPendingChange && (
            <Button variant="secondary" size="sm" onClick={handleApply}>
              Apply
            </Button>
          )}
        </div>
        <div
          id="theme-preview-container"
          className="rounded-[var(--radius-sm)] border border-border bg-panel p-[var(--space-3)] space-y-[var(--space-3)]"
        >
          {/* Table preview */}
          <div className="rounded-[var(--radius-sm)] border border-border overflow-hidden">
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
                  <TableCell className="font-mono text-[length:var(--text-xs,10px)]">
                    sample_format
                  </TableCell>
                  <TableCell className="text-text-muted">5 (IEEE Float)</TableCell>
                  <TableCell className="text-text-dim text-[length:var(--text-xs,10px)]">
                    int16
                  </TableCell>
                </TableRow>
                <TableRow className="hover:bg-[var(--row-hover)]">
                  <TableCell className="font-mono text-[length:var(--text-xs,10px)]">
                    num_samples
                  </TableCell>
                  <TableCell className="text-text-muted">1024</TableCell>
                  <TableCell className="text-text-dim text-[length:var(--text-xs,10px)]">
                    int16
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {/* Slider preview */}
          <div className="flex items-center gap-[var(--space-3)] rounded-[var(--radius-sm)] border border-border bg-panel-strong p-[var(--space-3)]">
            <input
              type="range"
              min={1}
              max={32}
              value={sliderValue}
              onChange={e => setSliderValue(parseInt(e.target.value, 10))}
              className="range-slider flex-1 w-full accent-accent"
            />
            <span className="min-w-[60px] text-right font-mono text-[length:var(--text-xs,10px)] text-text-muted">
              {sliderValue} / 32
            </span>
          </div>

          {/* Density scaling samples (respond to draft density class applied to this container).
              Demonstrates --text-* + .text-eyebrow tokens at different sizes. */}
          <div className="flex items-baseline gap-[var(--space-2)] text-[length:var(--text-xs,10px)] text-text-dim">
            <span className="text-eyebrow">DEMO</span>
            <span>xs</span>
            <span className="font-mono text-[length:var(--text-2xs,9px)]">2xs/mono</span>
            <span className="text-[length:var(--text-base,13px)] text-text">base body</span>
          </div>
        </div>
      </section>
    </div>
  );
};
