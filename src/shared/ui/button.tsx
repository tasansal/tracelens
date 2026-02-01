import * as React from 'react';

const buttonVariants = {
  primary:
    'rounded-full border border-black/10 bg-[linear-gradient(130deg,var(--accent)_0%,var(--accent-3)_100%)] px-4 py-2.5 font-bold tracking-[0.02em] text-accent-ink shadow-[0_8px_18px_var(--accent-glow)] transition duration-200 ease-out hover:-translate-y-px hover:shadow-[0_10px_22px_var(--accent-glow)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none motion-reduce:transition-none',
} as const;

type ButtonVariant = keyof typeof buttonVariants;

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', type = 'button', ...props }, ref) => {
    const classes = [buttonVariants[variant], className].filter(Boolean).join(' ');
    return <button ref={ref} type={type} className={classes} {...props} />;
  }
);

Button.displayName = 'Button';
