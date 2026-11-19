import { fireEvent } from '@testing-library/react';

// Gõ `text` vào ô ngày dd/mm/yyyy (`DateField`) từng ký tự như người dùng: mỗi ký tự một sự kiện `change`, con trỏ ở cuối. Xoá chữ cũ trước.
// Muốn mô phỏng dán hay tự điền cả ngày một lần thì dùng `fireEvent.change(ô, { target: { value: '2026-10-20' } })` (ô nhận cả ISO)
// hoặc `fireEvent.paste`.
export function fillDate(input: HTMLElement, text: string): void {
  const field = input as HTMLInputElement;
  if (field.value !== '') fireEvent.change(field, { target: { value: '' } });
  for (const char of text) {
    const next = field.value + char;
    fireEvent.change(field, {
      target: {
        value: next,
        selectionStart: next.length,
        selectionEnd: next.length,
      },
    });
  }
}
