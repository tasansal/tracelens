import { cn } from '@/shared/utils/cn';
import { CheckIcon } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import * as React from 'react';

type CheckboxSize = 'default' | 'sm';

interface CheckboxProps extends Omit<
  React.ComponentProps<typeof CheckboxPrimitive.Root>,
  'children'
> {
  size?: CheckboxSize;
}

/**
 * Checkbox primitive following the app's accent palette and radii.
 * Use size="sm" for extremely compact panels (e.g. trace control popover).
 */
function Checkbox({ className, size = 'default', ...props }: CheckboxProps) {
  const isSm = size === 'sm';

  // "sm" is a scaled-down version of the canonical checkbox (the one used in
  // Settings > AWS S3 > Anonymous Access). We only change size, radius,
  // shadow and icon. All accent/checked/focus tokens stay identical so the
  // visual character matches the reference exactly.
  const sizeClasses = isSm
    ? 'size-3.5 rounded-[3px] shadow-none focus-visible:ring-[2px]'
    : 'size-4 rounded-[4px] shadow-xs focus-visible:ring-[3px]';

  const iconClass = isSm ? 'size-2.5' : 'size-3.5';

  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer border-input dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive shrink-0 border outline-none transition-shadow disabled:cursor-not-allowed disabled:opacity-50',
        sizeClasses,
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className={iconClass} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
