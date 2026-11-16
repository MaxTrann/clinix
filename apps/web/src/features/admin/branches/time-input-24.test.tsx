import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { TimeInput24 } from './time-input-24';

// AF6-02 (admin PR2 mục 6.4): ô giờ 24h gõ tay thay `<input type="time">` (hiện AM/PM theo cài đặt Windows). Phần thuần ở
// `time-format.test.ts` (AF6-01); ở đây khoá việc nối mặt nạ vào ô, xóa dấu `:` (điều kiện A) và chuẩn hóa khi rời ô.

function Harness({
  initial = '',
  onValue = () => undefined,
  disabled = false,
}: {
  initial?: string;
  onValue?: (value: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <TimeInput24
      aria-label="Thứ 2 buổi sáng bắt đầu"
      value={value}
      disabled={disabled}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
}

const input = () =>
  screen.getByLabelText('Thứ 2 buổi sáng bắt đầu') as HTMLInputElement;

function typeInto(value: string, caret = value.length) {
  fireEvent.change(input(), {
    target: { value, selectionStart: caret, selectionEnd: caret },
  });
}

describe('TimeInput24: thuộc tính', () => {
  it('AF6-02 là ô chữ 24h, KHÔNG phải type="time"; có placeholder, maxLength và bàn phím số', () => {
    render(<Harness />);

    expect(input()).toHaveAttribute('type', 'text');
    expect(input()).not.toHaveAttribute('type', 'time');
    expect(input()).toHaveAttribute('placeholder', '08:00');
    expect(input()).toHaveAttribute('maxlength', '5');
    expect(input()).toHaveAttribute('inputmode', 'numeric');
    expect(input()).toHaveAttribute('autocomplete', 'off');
  });

  it('AF6-02 giữ aria-label hiện có làm tên truy cập', () => {
    render(<Harness />);

    expect(input()).toHaveAccessibleName('Thứ 2 buổi sáng bắt đầu');
  });

  it('AF6-02 vô hiệu hóa được (đang lưu)', () => {
    render(<Harness disabled />);

    expect(input()).toBeDisabled();
  });

  it('AF6-02 hiển thị giá trị có sẵn', () => {
    render(<Harness initial="08:30" />);

    expect(input()).toHaveValue('08:30');
  });
});

describe('TimeInput24: gõ', () => {
  it('AF6-02 gõ "8" ra "08:" và con trỏ nằm sau dấu hai chấm', () => {
    render(<Harness />);
    input().focus();

    typeInto('8');

    expect(input()).toHaveValue('08:');
    expect(input().selectionStart).toBe(3);
  });

  it('AF6-02 gõ lần lượt 0, 8, 3, 0 ra "08:30"', () => {
    render(<Harness />);
    input().focus();

    typeInto('0');
    typeInto('08');
    expect(input()).toHaveValue('08:');
    typeInto('08:3');
    typeInto('08:30');

    expect(input()).toHaveValue('08:30');
  });

  it('AF6-02 gõ liền "800" ra "08:00"', () => {
    render(<Harness />);
    input().focus();

    typeInto('800');

    expect(input()).toHaveValue('08:00');
  });

  it('AF6-02 chữ cái bị từ chối, giá trị giữ nguyên', () => {
    const onValue = vi.fn();
    render(<Harness initial="08:" onValue={onValue} />);
    input().focus();

    typeInto('08:a');

    expect(input()).toHaveValue('08:');
  });

  it('AF6-02 giờ không hợp lệ vẫn được giữ nguyên để báo ở lần Lưu (không tự sửa): 24:00 và 12:60', () => {
    render(<Harness />);
    input().focus();

    typeInto('24:00');
    expect(input()).toHaveValue('24:00');
    fireEvent.blur(input());
    expect(input()).toHaveValue('24:00');

    typeInto('12:60');
    fireEvent.blur(input());
    expect(input()).toHaveValue('12:60');
  });
});

describe('TimeInput24: xóa dấu `:` (điều kiện A)', () => {
  it('AF6-02 Backspace ngay sau ":" xóa chữ số đứng trước (ô không đứng yên)', () => {
    render(<Harness initial="08:30" />);
    input().focus();

    // "08:|30" Backspace ⇒ trình duyệt đưa "08|30"
    typeInto('0830', 2);

    expect(input()).toHaveValue('03:0');
    expect(input().selectionStart).toBe(1);
  });

  it('AF6-02 Delete (ghi nhận từ keydown) ngay trước ":" xóa chữ số đứng sau', () => {
    render(<Harness initial="08:30" />);
    input().focus();

    fireEvent.keyDown(input(), { key: 'Delete' });
    typeInto('0830', 2);

    expect(input()).toHaveValue('08:0');
    expect(input().selectionStart).toBe(2);
  });

  it('AF6-02 Delete nhận biết qua inputType của sự kiện input', () => {
    render(<Harness initial="08:30" />);
    input().focus();

    fireEvent.input(input(), {
      inputType: 'deleteContentForward',
      target: { value: '0830', selectionStart: 2, selectionEnd: 2 },
    });

    expect(input()).toHaveValue('08:0');
  });

  it('AF6-02 Backspace qua ":" ở cuối chỉ bỏ dấu hai chấm', () => {
    render(<Harness initial="08:" />);
    input().focus();

    typeInto('08');

    expect(input()).toHaveValue('08');
  });

  it('AF6-02 chèn dấu hai chấm (giá trị dài ra) không bị coi là xóa', () => {
    render(<Harness initial="1" />);
    input().focus();

    typeInto('1:');

    expect(input()).toHaveValue('1:');
  });
});

describe('TimeInput24: rời ô', () => {
  it.each([
    ['8:00', '08:00'],
    ['1:30', '01:30'],
    ['800', '08:00'],
  ])(
    'AF6-02 %j ⇒ %j khi rời ô, báo cho nơi dùng ĐÚNG MỘT lần',
    (typed, expected) => {
      const onValue = vi.fn();
      render(<Harness initial={typed} onValue={onValue} />);

      fireEvent.blur(input());

      expect(input()).toHaveValue(expected);
      expect(onValue).toHaveBeenCalledTimes(1);
      expect(onValue).toHaveBeenCalledWith(expected);
    },
  );

  it.each([['08:30'], ['08:3'], ['8'], ['']])(
    'AF6-02 %j: không có gì để chuẩn hóa thì không báo đổi',
    (value) => {
      const onValue = vi.fn();
      render(<Harness initial={value} onValue={onValue} />);

      fireEvent.blur(input());

      expect(input()).toHaveValue(value);
      expect(onValue).not.toHaveBeenCalled();
    },
  );
});
