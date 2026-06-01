import { fieldClass } from '@/shared/ui/field';
import { cn } from '@/shared/utils/cn';
import type * as React from 'react';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: React.Ref<HTMLTextAreaElement>;
};

export const Textarea = ({ className, ref, ...props }: TextareaProps) => (
  <textarea
    ref={ref}
    className={cn(fieldClass, 'w-full resize-y leading-relaxed', className)}
    {...props}
  />
);
