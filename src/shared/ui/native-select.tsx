/**
 * Thin wrapper around the native <select> element that applies the shared
 * `fieldClass` surface plus a custom chevron glyph. Use this for simple,
 * form-style selects where Radix's portal-based `<Select>` would be overkill
 * (e.g. mode / colormap pickers in dense control panels).
 */
import { fieldClass } from '@/shared/ui/field';
import { cn } from '@/shared/utils/cn';
import type * as React from 'react';

export type NativeSelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  ref?: React.Ref<HTMLSelectElement>;
};

// Inline SVG chevron — stroke tuned to a mid-dim color that reads in both themes.
const chevronStyle: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6' fill='none' stroke='%239a8f80' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M1 1l4 4 4-4'/></svg>\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 0.55rem center',
  backgroundSize: '10px 6px',
  paddingRight: '1.65rem',
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
};

export const NativeSelect = ({ className, children, style, ref, ...props }: NativeSelectProps) => (
  <select
    ref={ref}
    className={cn(fieldClass, 'cursor-pointer', className)}
    style={{ ...chevronStyle, ...style }}
    {...props}
  >
    {children}
  </select>
);
