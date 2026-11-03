import { useRef } from 'react';
import type { ClipboardEvent, KeyboardEvent, RefObject } from 'react';

import { OTP_LENGTH } from './otp-code';

// Ô còn trống giữ bằng dấu cách để vị trí các số không bị dồn
const EMPTY = ' ';

function toCells(value: string): string[] {
  return Array.from({ length: OTP_LENGTH }, (_, i) => {
    const char = value[i] ?? EMPTY;
    return char === EMPTY ? '' : char;
  });
}

function fromCells(cells: string[]): string {
  return cells.map((cell) => cell || EMPTY).join('');
}

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  firstInputRef?: RefObject<HTMLInputElement | null>;
  // id của hộp lỗi, để trình đọc màn hình đọc kèm nhóm ô
  describedBy?: string;
}

export function OtpInput({
  value,
  onChange,
  disabled,
  invalid,
  firstInputRef,
  describedBy,
}: OtpInputProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const cells = toCells(value);

  function focusCell(index: number) {
    const target = Math.min(Math.max(index, 0), OTP_LENGTH - 1);
    inputs.current[target]?.focus();
  }

  // Dán hoặc tự điền: đủ 6 số thì thay cả mã, ít hơn thì điền tiếp từ ô đang đứng
  function fillFrom(start: number, digits: string) {
    const from = digits.length >= OTP_LENGTH ? 0 : start;
    const next = [...cells];
    Array.from(digits.slice(0, OTP_LENGTH)).forEach((digit, offset) => {
      if (from + offset < OTP_LENGTH) next[from + offset] = digit;
    });
    onChange(fromCells(next));
    focusCell(from + digits.length);
  }

  function handleChange(index: number, raw: string) {
    const digits = raw.replace(/[^0-9]/g, '');
    if (digits === '') {
      if (raw === '') {
        const next = [...cells];
        next[index] = '';
        onChange(fromCells(next));
      }
      return;
    }
    // Gõ đè khi con trỏ không bôi đen: ô đang có số cũ thì lấy số mới
    const typed =
      digits.length === 2 && cells[index]
        ? digits.replace(cells[index], '')
        : digits;
    fillFrom(index, typed);
  }

  function handleKeyDown(index: number, event: KeyboardEvent) {
    if (event.key === 'Backspace' && !cells[index] && index > 0) {
      event.preventDefault();
      const next = [...cells];
      next[index - 1] = '';
      onChange(fromCells(next));
      focusCell(index - 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusCell(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusCell(index + 1);
    }
  }

  function handlePaste(index: number, event: ClipboardEvent) {
    event.preventDefault();
    const digits = event.clipboardData.getData('text').replace(/[^0-9]/g, '');
    if (digits) fillFrom(index, digits);
  }

  return (
    <div
      role="group"
      aria-label="Mã xác minh 6 chữ số"
      aria-describedby={describedBy}
      className="flex justify-center gap-2"
    >
      {cells.map((cell, index) => (
        <input
          key={index}
          ref={(element) => {
            inputs.current[index] = element;
            if (index === 0 && firstInputRef) firstInputRef.current = element;
          }}
          type="text"
          inputMode="numeric"
          // Không đặt maxLength: trình duyệt cắt mất mã khi tự điền vào ô đầu
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`Chữ số thứ ${index + 1} trong ${OTP_LENGTH}`}
          aria-invalid={invalid ? true : undefined}
          disabled={disabled}
          value={cell}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          onFocus={(event) => event.target.select()}
          // [...]: rộng 41,25px, cao 52px, viền 1,6px theo `642:39`; flex-1 để co lại ở 320px (sáu ô rộng 285px, thẻ chỉ còn 230px)
          className={`h-[52px] max-w-[41.25px] min-w-0 flex-1 border-[1.6px] p-0 text-center text-xl font-bold text-gray-900 ${
            invalid ? 'border-danger' : 'border-gray-500'
          }`}
        />
      ))}
    </div>
  );
}
