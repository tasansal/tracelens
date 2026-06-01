/**
 * Shared card and panel surface treatments.
 *
 * Canonical className constants for consistent card/panel rendering across
 * the main visualization window and the settings window.
 *
 * Extracted in Task 3.3 (Unify card and panel treatments) to eliminate
 * duplication (previously duplicated verbatim in AppearanceSettings and
 * StorageSettingsPanel) and reduce the "two apps" visual divergence.
 *
 * Usage:
 *   import { cardClassName, softCardClassName } from '@/shared/ui/card';
 *   <section className={cardClassName}>...</section>
 *   <div className={softCardClassName}>...</div>
 *
 * Semantics:
 * - `cardClassName`: Primary/large section containers ("cards") for grouped
 *   settings, forms, or content blocks. Uses --radius-xl, strong panel
 *   background for visual weight, generous padding, subtle inset shadow
 *   for depth (theme-adaptive via --card-inset-shadow).
 * - `softCardClassName`: Secondary/sub-section, note, example, or preview
 *   containers. Uses --radius-lg, muted panel background, standard padding.
 *   Matches the treatment used for info blocks and examples in dialogs.
 *
 * These are string constants (like `fieldClass` in field.ts) composed with
 * `cn()` where additional classes are needed. They are the single source of
 * truth; do not duplicate the class strings elsewhere.
 *
 * Related:
 * - Main content surfaces (e.g. the primary split-panel wrapper in App.tsx)
 *   use a distinct but related treatment (panel-tint + drop shadow via
 *   --shadow) appropriate to the atmospheric visualization shell.
 * - Floating surfaces (dialogs, popovers, selects) use rounded-lg + panel +
 *   --shadow (see dialog.tsx, popover.tsx).
 * - Dense chrome (e.g. TraceControlPanel controls) intentionally uses
 *   smaller --radius-sm surfaces.
 *
 * @see field.ts for the sibling form-field surface vocabulary.
 */

export const cardClassName =
  'rounded-[var(--radius-xl)] border border-border bg-panel-strong p-5 shadow-[var(--card-inset-shadow)]';

export const softCardClassName =
  'rounded-[var(--radius-lg)] border border-border bg-panel-muted p-4';
