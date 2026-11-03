import { Eye, EyeOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useId, useState } from 'react';
import type { InputHTMLAttributes, RefObject } from 'react';
import { FieldError } from '../auth-form-parts';

interface RegisterFieldInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon: LucideIcon;
  error?: string;
  // Câu hướng dẫn dưới ô; có lỗi thì câu lỗi thay chỗ để không chồng hai câu
  hint?: string;
  inputRef: RefObject<HTMLInputElement | null>;
  // Ô mật khẩu có nút hiện hoặc ẩn
  secret?: boolean;
}

export function RegisterFieldInput({
  label,
  icon: Icon,
  error,
  hint,
  inputRef,
  secret,
  ...inputProps
}: RegisterFieldInputProps) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const noteId = error || hint ? `${id}-note` : undefined;

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-gray-600"
      >
        {label}
      </label>
      <div className="relative">
        <Icon
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400"
          aria-hidden="true"
        />
        <input
          {...inputProps}
          ref={inputRef}
          id={id}
          type={secret ? (shown ? 'text' : 'password') : inputProps.type}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={noteId}
          className={`w-full py-3 pl-10 ${secret ? 'pr-10' : 'pr-4'} ${
            error ? 'border-danger' : ''
          }`}
        />
        {secret && (
          <button
            type="button"
            aria-label={`Hiện ${label.toLowerCase()}`}
            aria-pressed={shown}
            onClick={() => setShown((value) => !value)}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-500"
          >
            {shown ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      {error && noteId && <FieldError id={noteId}>{error}</FieldError>}
      {!error && hint && (
        <p id={noteId} className="mt-1 text-xs text-gray-500">
          {hint}
        </p>
      )}
    </div>
  );
}
