import { fieldClass } from '@/shared/ui/field';
import { cn } from '@/shared/utils/cn';
import type * as React from 'react';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  ref?: React.Ref<HTMLInputElement>;
};

const Input = ({ className, type, ref, ...props }: InputProps) => (
  <input type={type} className={cn(fieldClass, 'w-full', className)} ref={ref} {...props} />
);

export { Input };
