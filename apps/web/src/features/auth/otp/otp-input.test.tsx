import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { OtpInput } from './otp-input';

// Task F2. Mã ca OT-nn là [đề xuất].
function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <OtpInput value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

const cell = (n: number) =>
  screen.getByLabelText<HTMLInputElement>(`Chữ số thứ ${n} trong 6`);
const value = () => screen.getByTestId('value').textContent;
const paste = (target: HTMLElement, text: string) =>
  fireEvent.paste(target, { clipboardData: { getData: () => text } });

describe('OtpInput', () => {
  it('OT-10 sáu ô có nhãn, bàn phím số, ô đầu nhận tự điền', () => {
    render(<Harness />);
    for (let n = 1; n <= 6; n += 1) {
      expect(cell(n)).toHaveAttribute('inputmode', 'numeric');
      expect(cell(n)).not.toHaveAttribute('maxlength');
    }
    expect(cell(1)).toHaveAttribute('autocomplete', 'one-time-code');
    expect(cell(2)).toHaveAttribute('autocomplete', 'off');
    expect(
      screen.getByRole('group', { name: 'Mã xác minh 6 chữ số' }),
    ).toBeInTheDocument();
  });

  it('OT-11 gõ một số: điền ô và nhảy ô kế', () => {
    render(<Harness />);
    fireEvent.change(cell(1), { target: { value: '7' } });
    expect(cell(1).value).toBe('7');
    expect(cell(2)).toHaveFocus();
  });

  it('OT-12 ký tự không phải số bị bỏ, ô không đổi', () => {
    render(<Harness initial="1" />);
    fireEvent.change(cell(2), { target: { value: 'a' } });
    expect(value()).toBe('1');
  });

  it('OT-13 gõ đè khi ô đã có số, kể cả số mới trùng số cũ', () => {
    render(<Harness initial="123456" />);
    fireEvent.change(cell(2), { target: { value: '92' } });
    expect(value()).toBe('193456');
    fireEvent.change(cell(3), { target: { value: '33' } });
    expect(value()).toBe('193456');
  });

  it.each([1, 3, 6])('OT-14 dán đủ 6 số vào ô %i: thay cả mã', (n) => {
    render(<Harness initial="9" />);
    paste(cell(n), '012345');
    expect(value()).toBe('012345');
    expect(cell(6)).toHaveFocus();
  });

  it('OT-15 dán có dấu cách, dán dài hơn 6, dán chữ', () => {
    render(<Harness />);
    paste(cell(1), ' 12 34 56 ');
    expect(value()).toBe('123456');
    paste(cell(1), '98765432');
    expect(value()).toBe('987654');
    paste(cell(1), 'abc');
    expect(value()).toBe('987654');
  });

  it('OT-16 dán ít hơn 6: điền tiếp từ ô đang đứng, không tràn', () => {
    render(<Harness />);
    paste(cell(5), '123');
    expect(value()).toBe('    12');
    expect(cell(6)).toHaveFocus();
  });

  it('OT-17 tự điền cả mã vào ô đầu', () => {
    render(<Harness />);
    fireEvent.change(cell(1), { target: { value: '654321' } });
    expect(value()).toBe('654321');
  });

  it('OT-18 Backspace ở ô có số: xoá ô đó, giữ vị trí các số sau', () => {
    render(<Harness initial="123456" />);
    fireEvent.change(cell(3), { target: { value: '' } });
    expect(value()).toBe('12 456');
    expect(cell(4).value).toBe('4');
  });

  it('OT-19 Backspace ở ô trống: xoá ô trước và lùi về', () => {
    render(<Harness initial="12" />);
    cell(3).focus();
    fireEvent.keyDown(cell(3), { key: 'Backspace' });
    expect(value()).toBe('1     ');
    expect(cell(2)).toHaveFocus();
  });

  it('OT-20 Backspace ở ô đầu trống và phím khác: không làm gì', () => {
    render(<Harness />);
    cell(1).focus();
    fireEvent.keyDown(cell(1), { key: 'Backspace' });
    fireEvent.keyDown(cell(1), { key: 'Tab' });
    expect(cell(1)).toHaveFocus();
  });

  it('OT-21 mũi tên đi giữa các ô và dừng ở hai đầu', () => {
    render(<Harness />);
    cell(1).focus();
    fireEvent.keyDown(cell(1), { key: 'ArrowLeft' });
    expect(cell(1)).toHaveFocus();
    fireEvent.keyDown(cell(1), { key: 'ArrowRight' });
    expect(cell(2)).toHaveFocus();
    fireEvent.keyDown(cell(2), { key: 'ArrowLeft' });
    expect(cell(1)).toHaveFocus();
    cell(6).focus();
    fireEvent.keyDown(cell(6), { key: 'ArrowRight' });
    expect(cell(6)).toHaveFocus();
  });

  it('OT-22 focus thì bôi đen, disabled và invalid truyền xuống ô', () => {
    const { rerender } = render(
      <OtpInput value="1" onChange={vi.fn()} invalid />,
    );
    const select = vi.spyOn(cell(1), 'select');
    fireEvent.focus(cell(1));
    expect(select).toHaveBeenCalled();
    expect(cell(1)).toHaveAttribute('aria-invalid', 'true');
    expect(cell(1).className).toContain('border-danger');
    rerender(<OtpInput value="1" onChange={vi.fn()} disabled />);
    expect(cell(6)).toBeDisabled();
    expect(cell(1)).not.toHaveAttribute('aria-invalid');
  });
});
