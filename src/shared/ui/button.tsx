import { cn } from '@/shared/utils/cn';
import type * as React from 'react';

// Shared base for secondary-tier variants (same shape, size, and interaction model).
const subActionBase =
  'rounded-full border border-[var(--accent-2-muted)] px-4 py-1.5 text-[length:var(--text-sm,12px)] font-medium transition duration-150 ease-out hover:-translate-y-px hover:bg-panel active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none';

const buttonVariants = {
  primary:
    'rounded-full border border-black/10 bg-[linear-gradient(130deg,var(--accent)_0%,var(--accent-3)_100%)] px-4 py-1.5 text-[length:var(--text-sm,12px)] font-bold tracking-[0.02em] text-accent-ink shadow-[0_8px_18px_var(--accent-glow)] transition duration-200 ease-out hover:-translate-y-px hover:shadow-[0_10px_22px_var(--accent-glow)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none motion-reduce:transition-none',
  secondary: `${subActionBase} bg-panel-muted text-text shadow-[inset_0_1px_0_rgba(15,23,42,0.03)] hover:shadow-[inset_0_1px_0_rgba(15,23,42,0.06)]`,
  tonal: `${subActionBase} bg-panel-strong text-accent-2 hover:border-accent-2/40`,
  ghost:
    'rounded px-2 py-0.5 text-[length:var(--text-xs,10px)] font-medium text-text-dim transition duration-150 hover:bg-panel hover:text-text disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
} as const;

const buttonSizes = {
  sm: 'px-2.5 py-1 text-[length:var(--text-xs,10px)]',
  md: 'px-3.5 py-1.5 text-[length:var(--text-sm,12px)]',
  lg: 'px-5 py-2 text-[length:var(--text-base,13px)]',
} as const;

type ButtonVariant = keyof typeof buttonVariants;
type ButtonSize = keyof typeof buttonSizes;

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  ref?: React.Ref<HTMLButtonElement>;
};

export const Button = ({
  className,
  variant = 'primary',
  size,
  type = 'button',
  ref,
  ...props
}: ButtonProps) => (
  <button
    ref={ref}
    type={type}
    className={cn(buttonVariants[variant], size && buttonSizes[size], className)}
    {...props}
  />
);
