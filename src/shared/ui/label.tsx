import { cn } from '@/shared/utils/cn';
import * as LabelPrimitive from '@radix-ui/react-label';
import type * as React from 'react';

type LabelProps = React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & {
  ref?: React.Ref<React.ElementRef<typeof LabelPrimitive.Root>>;
};

const Label = ({ className, ref, ...props }: LabelProps) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'text-[length:var(--text-sm,12px)] font-medium leading-none text-text peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      className
    )}
    {...props}
  />
);

export { Label };
