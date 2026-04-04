import { cn } from '@/shared/utils/cn';
import * as React from 'react';

type SectionTitleProps<T extends React.ElementType> = {
  as?: T;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;

export const SectionTitle = <T extends React.ElementType = 'h2'>({
  as,
  className,
  children,
  ...props
}: SectionTitleProps<T>) => {
  const Component = (as ?? 'h2') as React.ElementType;

  return (
    <Component
      className={cn('text-[13px] font-extrabold uppercase tracking-[0.2em] text-text', className)}
      {...props}
    >
      {children}
    </Component>
  );
};
