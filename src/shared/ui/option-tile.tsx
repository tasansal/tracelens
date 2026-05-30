/**
 * Unified "pick one of N" surface used by segmented toggles (horizontal row)
 * and radio-style lists (vertical column). Renders a button with an active
 * affordance: accent-2 hairline border + panel-strong bg + subtle inner shadow.
 *
 * Layout is the caller's responsibility — wrap a group in `<div className="flex">`
 * for a segmented toggle, or `<div className="flex flex-col gap-2">` for a list.
 */
import { cn } from '@/shared/utils/cn';
import type * as React from 'react';

export type OptionTileProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  /** Compact = segmented-toggle height. Default = full-row list style. */
  density?: 'compact' | 'row';
  ref?: React.Ref<HTMLButtonElement>;
};

export const OptionTile = ({
  className,
  selected = false,
  density = 'row',
  type = 'button',
  children,
  ref,
  ...props
}: OptionTileProps) => {
  const base =
    'relative flex items-center gap-3 rounded-[var(--radius-sm)] border text-left transition duration-150 ease-out focus-ring motion-reduce:transition-none';
  const densityClass =
    density === 'compact'
      ? 'flex-1 justify-center px-2 py-1 text-[length:var(--text-xs,10px)] font-semibold uppercase tracking-[0.18em]'
      : 'w-full px-3 py-2.5 text-[length:var(--text-sm,12px)]';
  const state = selected
    ? 'border-[var(--accent-2-muted)] bg-panel-strong text-text shadow-[inset_0_1px_0_rgba(15,23,42,0.03),inset_0_0_0_1px_var(--accent-2-muted)]'
    : 'border-transparent text-text-dim hover:text-text hover:bg-panel-muted/60';

  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={selected}
      className={cn(base, densityClass, state, className)}
      {...props}
    >
      {children}
    </button>
  );
};
