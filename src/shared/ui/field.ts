/**
 * Shared form-control surface style. Every text input, number input, select, and
 * textarea in TraceLens composes this class so they share height, padding, radius,
 * and focus behavior. Pair with the `focus-ring` utility (from `index.css`) for the
 * keyboard focus affordance.
 */
export const fieldClass =
  'rounded-[var(--radius-sm)] border border-border bg-panel-muted px-2.5 py-1.5 text-[length:var(--text-sm,12px)] text-text transition duration-200 placeholder:text-text-dim disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none focus-ring';
