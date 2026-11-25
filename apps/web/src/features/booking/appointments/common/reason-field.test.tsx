import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { ReasonField } from './reason-field';

// reschedule F4 Pha B1, WXD-81 `[đề xuất]` (Đại cho phép thêm prop tuỳ chọn `hint` 25/11/2026): dòng nhắc nối vào `aria-describedby` của ô; hộp cũ (Huỷ của Lễ tân, override của Quản trị viên) không truyền `hint`
// nên KHÔNG đổi gì. Ca này khoá cả hai nhánh để một sửa sau này không làm hộp cũ lệch.
function renderField(props: { hint?: string; error?: string | null }) {
  const fieldRef = createRef<HTMLTextAreaElement>();
  render(
    <ReasonField
      label="Lý do"
      hint={props.hint}
      value=""
      onChange={() => undefined}
      error={props.error ?? null}
      locked={false}
      fieldRef={fieldRef}
    />,
  );
  return screen.getByRole('textbox', { name: /Lý do/ });
}

describe('ReasonField: prop hint', () => {
  it('WXD-81 không có `hint`: không có đoạn nhắc, ô không có `aria-describedby` khi không lỗi (như trước)', () => {
    const field = renderField({});
    expect(field).not.toHaveAttribute('aria-describedby');
    expect(document.querySelector('[id$="-hint"]')).toBeNull();
  });

  it('WXD-81 không có `hint` mà có lỗi: `aria-describedby` chỉ trỏ vào lỗi (như trước)', () => {
    const field = renderField({ error: 'Cần nhập' });
    const alert = screen.getByRole('alert');
    expect(field).toHaveAttribute('aria-describedby', alert.id);
  });

  it('WXD-81 có `hint`: hiện đoạn nhắc và ô được mô tả bởi nó', () => {
    const field = renderField({ hint: 'Bệnh nhân sẽ đọc ghi chú này.' });
    const hint = screen.getByText('Bệnh nhân sẽ đọc ghi chú này.');
    expect(field).toHaveAccessibleDescription('Bệnh nhân sẽ đọc ghi chú này.');
    expect(field.getAttribute('aria-describedby')).toBe(hint.id);
  });

  it('WXD-81 có `hint` và có lỗi: ô được mô tả bởi CẢ HAI (nhắc rồi lỗi)', () => {
    const field = renderField({ hint: 'Dòng nhắc', error: 'Lỗi ở ô' });
    const hint = screen.getByText('Dòng nhắc');
    const alert = screen.getByRole('alert');
    expect(field.getAttribute('aria-describedby')).toBe(
      `${hint.id} ${alert.id}`,
    );
    expect(field).toHaveAccessibleDescription('Dòng nhắc Lỗi ở ô');
  });
});
