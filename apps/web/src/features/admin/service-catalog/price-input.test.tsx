import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PriceInput } from './price-input';

// AF3-13 (admin PR2 mục 6.3), phần component của ô giá: gõ, giữ con trỏ, xóa qua dấu chấm (điều kiện A), dán, thả chữ (điều kiện E).
// vitest không có `inputType` thật của trình duyệt nên con trỏ và phím được khoá ở mức `fireEvent.change`; phím thật đo ở Chromium.

function Harness({
  initial = '',
  onTooLong = () => undefined,
}: {
  initial?: string;
  onTooLong?: () => void;
}) {
  const [digits, setDigits] = useState(initial);
  return (
    <>
      <label htmlFor="price">Giá mặc định (VND)</label>
      <PriceInput
        id="price"
        digits={digits}
        onDigitsChange={setDigits}
        onTooLong={onTooLong}
        className="field"
        invalid={false}
      />
      <output data-testid="digits">{digits}</output>
    </>
  );
}

const input = () =>
  screen.getByLabelText('Giá mặc định (VND)') as HTMLInputElement;
const state = () => screen.getByTestId('digits').textContent;

function typeInto(value: string, caret: number) {
  fireEvent.change(input(), {
    target: { value, selectionStart: caret, selectionEnd: caret },
  });
}

describe('PriceInput: hiển thị', () => {
  it('AF3-13 giá chữ số hiển thị ngăn nghìn bằng dấu chấm', () => {
    render(<Harness initial="3000000" />);

    expect(input()).toHaveValue('3.000.000');
  });

  it('AF3-13 thuộc tính của ô: bàn phím số, không gợi ý tự điền', () => {
    render(<Harness />);

    expect(input()).toHaveAttribute('inputmode', 'numeric');
    expect(input()).toHaveAttribute('autocomplete', 'off');
  });

  it('AF3-13 hậu tố "đ" chỉ là trang trí (aria-hidden); tên truy cập của ô không có chữ "đ"', () => {
    render(<Harness initial="150000" />);

    expect(screen.getByText('đ')).toHaveAttribute('aria-hidden', 'true');
    expect(input()).toHaveAccessibleName('Giá mặc định (VND)');
    // Hậu tố nằm ngoài giá trị của ô (không lọt vào chuỗi gửi đi)
    expect(input().value).not.toContain('đ');
  });

  it('AF3-13 trạng thái lỗi, mô tả và vô hiệu được chuyển vào ô', () => {
    render(
      <PriceInput
        id="p"
        digits=""
        onDigitsChange={vi.fn()}
        onTooLong={vi.fn()}
        className="field"
        invalid
        describedBy="p-error"
        disabled
      />,
    );
    const field = document.getElementById('p');

    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAttribute('aria-describedby', 'p-error');
    expect(field).toBeDisabled();
  });
});

describe('PriceInput: gõ và giữ con trỏ', () => {
  it('AF3-13 gõ chữ số: ô tự ngăn nghìn', () => {
    render(<Harness initial="300000" />);
    input().focus();

    typeInto('300.0001', 8);

    expect(input()).toHaveValue('3.000.001');
    expect(state()).toBe('3000001');
  });

  it('AF3-13 gõ giữa chuỗi: con trỏ ở lại ngay sau chữ số vừa gõ dù dấu chấm đổi chỗ', () => {
    render(<Harness initial="1000" />);
    input().focus();

    typeInto('1.2000', 3);

    expect(input()).toHaveValue('12.000');
    expect(input().selectionStart).toBe(2);
    expect(input().selectionEnd).toBe(2);
  });

  it('AF3-13 ký tự không phải số bị từ chối: giá trị và con trỏ giữ nguyên', () => {
    render(<Harness initial="150" />);
    input().focus();

    typeInto('1a50', 2);

    expect(input()).toHaveValue('150');
    expect(state()).toBe('150');
    expect(input().selectionStart).toBe(1);
  });

  it('AF3-13 chữ số thứ 11 bị bỏ qua', () => {
    render(<Harness initial="9999999999" />);
    input().focus();

    typeInto('99.999.999.9999', 15);

    expect(input()).toHaveValue('9.999.999.999');
    expect(state()).toBe('9999999999');
  });

  it('AF3-13 số 0 đứng đầu bị bỏ', () => {
    render(<Harness initial="5" />);
    input().focus();

    typeInto('05', 1);

    expect(input()).toHaveValue('5');
    expect(input().selectionStart).toBe(0);
  });
});

describe('PriceInput: xóa qua dấu chấm (điều kiện A)', () => {
  it('AF3-13 Backspace ngay sau dấu chấm xóa chữ số đứng trước nó (không có sự kiện phím, mặc định Backspace)', () => {
    render(<Harness initial="13000" />);
    input().focus();

    // "13.|000" Backspace ⇒ trình duyệt chỉ bỏ dấu chấm
    typeInto('13000', 2);

    expect(input()).toHaveValue('1.000');
    expect(state()).toBe('1000');
    expect(input().selectionStart).toBe(1);
  });

  it('AF3-13 Delete (ghi nhận từ keydown) xóa chữ số đứng sau dấu chấm', () => {
    render(<Harness initial="13000" />);
    input().focus();

    fireEvent.keyDown(input(), { key: 'Delete' });
    typeInto('13000', 2);

    expect(input()).toHaveValue('1.300');
    expect(state()).toBe('1300');
    expect(input().selectionStart).toBe(3);
  });

  it('AF3-13 Delete nhận biết qua inputType của sự kiện input', () => {
    render(<Harness initial="13000" />);
    input().focus();

    fireEvent.input(input(), {
      inputType: 'deleteContentForward',
      target: { value: '13000', selectionStart: 2, selectionEnd: 2 },
    });

    expect(state()).toBe('1300');
  });

  it('AF3-13 Backspace nhận biết qua inputType của sự kiện input, kể cả khi keydown trước đó là Delete', () => {
    render(<Harness initial="13000" />);
    input().focus();

    fireEvent.keyDown(input(), { key: 'Delete' });
    fireEvent.input(input(), {
      inputType: 'deleteContentBackward',
      target: { value: '13000', selectionStart: 2, selectionEnd: 2 },
    });

    expect(state()).toBe('1000');
  });

  it('AF3-13 xóa chữ số thật vẫn hoạt động như thường', () => {
    render(<Harness initial="1000" />);
    input().focus();

    typeInto('1.00', 4);

    expect(state()).toBe('100');
    expect(input()).toHaveValue('100');
  });
});

describe('PriceInput: dán và thả chữ (điều kiện E)', () => {
  it.each([
    ['3,000,000', '3.000.000'],
    ['3.000.000đ', '3.000.000'],
    ['300 000', '300.000'],
    ['300.000,50', '300.000'],
    ['150000.50', '150.000'],
  ])(
    'AF3-13 dán %j ⇒ %j và hủy việc dán mặc định của trình duyệt',
    (text, shown) => {
      render(<Harness />);
      input().focus();

      const notCancelled = fireEvent.paste(input(), {
        clipboardData: { getData: () => text },
      });

      expect(notCancelled).toBe(false);
      expect(input()).toHaveValue(shown);
      expect(state()).toBe(shown.replace(/\./gu, ''));
    },
  );

  it('AF3-13 dán đè vùng chọn', () => {
    render(<Harness initial="150000" />);
    input().focus();
    input().setSelectionRange(0, input().value.length);

    fireEvent.paste(input(), { clipboardData: { getData: () => '90' } });

    expect(state()).toBe('90');
  });

  it('AF3-13 dán quá 10 chữ số: bỏ lần dán, giá trị cũ giữ nguyên, báo onTooLong một lần', () => {
    const onTooLong = vi.fn();
    render(<Harness initial="500" onTooLong={onTooLong} />);
    input().focus();

    fireEvent.paste(input(), {
      clipboardData: { getData: () => '12345678901' },
    });

    expect(state()).toBe('500');
    expect(input()).toHaveValue('500');
    expect(onTooLong).toHaveBeenCalledTimes(1);
  });

  it('AF3-13 thả chữ vào ô (drop) đi cùng đường với dán: không ném lỗi, giá trị là chuỗi chữ số hợp lệ', () => {
    render(<Harness />);

    const notCancelled = fireEvent.drop(input(), {
      dataTransfer: { getData: () => '150000.50' },
    });

    expect(notCancelled).toBe(false);
    expect(state()).toBe('150000');
    expect(input()).toHaveValue('150.000');
  });

  it('AF3-13 thả chữ không có chữ số hay thả rỗng: không đổi gì, không ném lỗi', () => {
    render(<Harness initial="70" />);

    fireEvent.drop(input(), { dataTransfer: { getData: () => 'abc' } });
    fireEvent.drop(input(), { dataTransfer: { getData: () => '' } });
    fireEvent.paste(input(), { clipboardData: { getData: () => '' } });

    expect(state()).toBe('70');
    expect(input()).toHaveValue('70');
  });
});
