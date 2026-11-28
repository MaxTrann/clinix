import { fireEvent, screen } from '@testing-library/react';

// Thao tác chung của test biểu mẫu bài viết (dựa vào nhãn ô theo PLAN 5.11)
export const field = (label: string) => screen.getByLabelText(label);

export const fill = (label: string, value: string) =>
  fireEvent.change(field(label), { target: { value } });

export const clickSave = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

// Thêm một thẻ bằng cách gõ rồi Enter ở ô Thẻ
export function addTag(name: string) {
  fireEvent.focus(field('Thẻ'));
  fireEvent.change(field('Thẻ'), { target: { value: name } });
  fireEvent.keyDown(field('Thẻ'), { key: 'Enter' });
}

export const chooseStatus = (label: string) =>
  fireEvent.change(field('Trạng thái'), {
    target: { value: label },
  });
