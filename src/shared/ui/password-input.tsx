/**
 * Text input with an overlaid show/hide toggle for sensitive values
 * (API keys, access tokens, SAS tokens). Owns its own reveal state and
 * otherwise behaves as a standard controlled `<Input>`.
 */
import { Input, type InputProps } from '@/shared/ui/input';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

export type PasswordInputProps = Omit<InputProps, 'type'>;

export const PasswordInput = ({ ...props }: PasswordInputProps) => {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className="relative">
      <Input type={visible ? 'text' : 'password'} {...props} />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Hide value' : 'Show value'}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--radius-sm)] p-1.5 text-text-dim transition-colors hover:bg-panel-muted hover:text-text"
      >
        <Icon className="size-4" aria-hidden />
      </button>
    </div>
  );
};
