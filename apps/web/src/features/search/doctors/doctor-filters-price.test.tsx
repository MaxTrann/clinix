import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DoctorFilters } from './doctor-filters';
import {
  DEFAULT_SORT,
  PRICE_RANGE_MESSAGE,
  validateDoctorFilters,
  type DoctorFilterValues,
} from './doctor-filter-rules';

// UIA-05 (search UI PR-A, G4): hai ô giá của bộ lọc bác sĩ hiển thị ngăn nghìn "500.000" khi gõ, dán, xoá (cùng bộ định dạng với ô giá của admin,
// `shared/masked-input`); giá trị trong state và lên API vẫn là chuỗi chữ số thuần ("500000"). vitest không có `inputType` và con trỏ thật của
// trình duyệt nên con trỏ khoá ở mức hàm thuần (`price-format.test.ts`, UIA-03); phím thật đo ở Chromium.

const INITIAL: DoctorFilterValues = {
  chiNhanhId: '',
  chuyenKhoaId: '',
  q: '',
  giaTu: '',
  giaDen: '',
  diemTu: '',
  sapXep: DEFAULT_SORT,
};

type Patch = Partial<DoctorFilterValues>;

function Harness({
  initial = INITIAL,
  spy,
}: {
  initial?: DoctorFilterValues;
  spy?: (patch: Patch) => void;
}) {
  const [values, setValues] = useState(initial);
  return (
    <>
      <DoctorFilters
        values={values}
        errors={validateDoctorFilters(values)}
        branches={[]}
        onChange={(patch) => {
          spy?.(patch);
          setValues((current) => ({ ...current, ...patch }));
        }}
      />
      <output data-testid="from">{values.giaTu}</output>
      <output data-testid="to">{values.giaDen}</output>
    </>
  );
}

const from = () => screen.getByLabelText('Giá từ (đ)') as HTMLInputElement;
const to = () => screen.getByLabelText('Giá đến (đ)') as HTMLInputElement;
const stateFrom = () => screen.getByTestId('from').textContent;
const stateTo = () => screen.getByTestId('to').textContent;

function typeInto(field: HTMLInputElement, value: string, caret: number) {
  fireEvent.change(field, {
    target: { value, selectionStart: caret, selectionEnd: caret },
  });
}

function pasteInto(field: HTMLInputElement, text: string) {
  field.focus();
  fireEvent.paste(field, { clipboardData: { getData: () => text } });
}

describe('UIA-05 ô giá của bộ lọc: định dạng nghìn, giá trị thuần chữ số', () => {
  it('UIA-05 gõ "500000" ⇒ ô hiện "500.000", state và onChange chỉ nhận "500000"', () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);

    typeInto(from(), '500000', 6);

    expect(from()).toHaveValue('500.000');
    expect(stateFrom()).toBe('500000');
    expect(spy).toHaveBeenCalledWith({ giaTu: '500000' });
  });

  it('UIA-05 gõ từng chữ số: 5 ⇒ 50 ⇒ 500 ⇒ 5000 hiện "5.000", rồi "50.000"', () => {
    render(<Harness />);

    typeInto(from(), '5', 1);
    expect(from()).toHaveValue('5');
    typeInto(from(), '50', 2);
    typeInto(from(), '500', 3);
    expect(from()).toHaveValue('500');
    typeInto(from(), '5005', 4);
    expect(from()).toHaveValue('5.005');
    typeInto(from(), '5.0050', 6);
    expect(from()).toHaveValue('50.050');
    expect(stateFrom()).toBe('50050');
  });

  it('UIA-05 hai ô độc lập: "Giá đến" nhận "1500000" hiện "1.500.000", "Giá từ" không đổi', () => {
    render(<Harness />);

    typeInto(from(), '200000', 6);
    typeInto(to(), '1500000', 7);

    expect(from()).toHaveValue('200.000');
    expect(to()).toHaveValue('1.500.000');
    expect(stateFrom()).toBe('200000');
    expect(stateTo()).toBe('1500000');
  });

  it('UIA-05 nạp sẵn "1500000" từ state ⇒ hiện "1.500.000"', () => {
    render(<Harness initial={{ ...INITIAL, giaTu: '1500000' }} />);

    expect(from()).toHaveValue('1.500.000');
  });

  it('UIA-05 dán "1.500.000" và "1.500.000,50" ⇒ cùng ra "1.500.000", state "1500000", hủy việc dán mặc định', () => {
    render(<Harness />);
    from().focus();

    const notCancelled = fireEvent.paste(from(), {
      clipboardData: { getData: () => '1.500.000' },
    });
    expect(notCancelled).toBe(false);
    expect(from()).toHaveValue('1.500.000');
    expect(stateFrom()).toBe('1500000');

    // dán đè toàn bộ bằng số có đuôi lẻ: đuôi ",50" bị bỏ, không thành 150000050
    from().setSelectionRange(0, from().value.length);
    fireEvent.paste(from(), {
      clipboardData: { getData: () => '1.500.000,50' },
    });
    expect(from()).toHaveValue('1.500.000');
    expect(stateFrom()).toBe('1500000');
  });

  it('UIA-05 xoá chữ số ở giữa: "1.500.000" bỏ "5" ⇒ "100.000"', () => {
    render(<Harness initial={{ ...INITIAL, giaTu: '1500000' }} />);

    // Backspace sau "1.5": trình duyệt tạo "1.00.000", con trỏ ở 2
    typeInto(from(), '1.00.000', 2);

    expect(from()).toHaveValue('100.000');
    expect(stateFrom()).toBe('100000');
  });

  it('UIA-05 xoá qua dấu chấm: Backspace ngay sau dấu chấm xoá luôn chữ số kề trái, ô không "đứng yên"', () => {
    render(<Harness initial={{ ...INITIAL, giaTu: '1500000' }} />);

    // "1.500.000" Backspace sau dấu chấm thứ hai: trình duyệt chỉ bỏ dấu chấm ⇒ "1.500000", con trỏ ở 5
    typeInto(from(), '1.500000', 5);

    expect(from()).toHaveValue('150.000');
    expect(stateFrom()).toBe('150000');
  });

  it('UIA-05 xoá hết ⇒ ô rỗng, state rỗng, không có lỗi', () => {
    render(<Harness initial={{ ...INITIAL, giaTu: '5' }} />);

    typeInto(from(), '', 0);

    expect(from()).toHaveValue('');
    expect(stateFrom()).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('UIA-05 ca âm: gõ hoặc dán "-5" ⇒ ô chỉ còn "5", KHÔNG báo lỗi "Giá phải là số không âm"', () => {
    render(<Harness />);

    typeInto(from(), '-5', 2);
    expect(from()).toHaveValue('5');
    expect(stateFrom()).toBe('5');

    pasteInto(to(), '-5');
    expect(to()).toHaveValue('5');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(from()).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('UIA-05 ca âm: chữ cái và ký hiệu bị bỏ ("abc", "12abc3" ⇒ "123")', () => {
    render(<Harness />);

    typeInto(from(), 'abc', 3);
    expect(from()).toHaveValue('');
    typeInto(from(), '12abc3', 6);
    expect(from()).toHaveValue('123');
    expect(stateFrom()).toBe('123');
  });

  it('UIA-05 biên: đúng 12 chữ số được nhận (khớp API ^\\d{1,12}$), chữ số thứ 13 bị bỏ, dán 13 chữ số bị bỏ', () => {
    render(<Harness />);
    from().focus();

    pasteInto(from(), '123456789012');
    expect(from()).toHaveValue('123.456.789.012');
    expect(stateFrom()).toBe('123456789012');

    typeInto(from(), '123.456.789.0123', 16);
    expect(stateFrom()).toBe('123456789012');

    pasteInto(to(), '1234567890123');
    expect(to()).toHaveValue('');
    expect(stateTo()).toBe('');
  });

  it('UIA-05 lỗi khoảng giá giữ nguyên: giá từ 500.000 > giá đến 100.000 ⇒ role="alert", aria-invalid ở ô "Giá từ", mô tả trỏ tới thông báo', () => {
    render(<Harness />);

    typeInto(from(), '500000', 6);
    typeInto(to(), '100000', 6);

    expect(screen.getByRole('alert')).toHaveTextContent(PRICE_RANGE_MESSAGE);
    expect(PRICE_RANGE_MESSAGE).toBe('Giá từ phải nhỏ hơn hoặc bằng giá đến');
    expect(from()).toHaveAttribute('aria-invalid', 'true');
    expect(from()).toHaveAttribute(
      'aria-describedby',
      'doctor-price-from-error',
    );
    expect(to()).not.toHaveAttribute('aria-invalid', 'true');
    // sửa "Giá đến" cho đủ lớn ⇒ hết lỗi
    typeInto(to(), '600000', 6);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('UIA-05 thuộc tính: bàn phím số, không placeholder, không hậu tố "đ" ở trong ô, nhãn giữ "(đ)"', () => {
    render(<Harness />);

    for (const field of [from(), to()]) {
      expect(field).toHaveAttribute('inputmode', 'numeric');
      expect(field.placeholder).toBe('');
      expect(field).toHaveClass('h-12', 'rounded-[13.375px]');
    }
    expect(screen.queryByText('đ')).toBeNull();
    expect(screen.getByText('Giá từ (đ)')).toBeInTheDocument();
    expect(screen.getByText('Giá đến (đ)')).toBeInTheDocument();
  });

  it('UIA-05 mọi giá trị onChange của hai ô đều là chuỗi chữ số thuần (không dấu chấm), kể cả khi dán số có dấu', () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);

    typeInto(from(), '1500000', 7);
    pasteInto(to(), '2.500.000,00');
    typeInto(from(), '1.50.000', 3);

    const patches = spy.mock.calls.map(([patch]) => patch as Patch);
    expect(patches.length).toBeGreaterThanOrEqual(3);
    for (const patch of patches) {
      for (const value of Object.values(patch)) {
        expect(String(value)).toMatch(/^\d*$/u);
      }
    }
  });
});
