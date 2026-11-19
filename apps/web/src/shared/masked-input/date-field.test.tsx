import { createRef, useState, type ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { fillDate } from '../../test/fill-date';
import { DateField } from './date-field';
import { DATE_TEXT } from './date-text';

// UX1-25 đến UX1-44 (doctor UX1, G5): `DateField` thay `input type="date"` ở 10 chỗ. Ô chữ dd/mm/yyyy có mặt nạ, nút lịch mở bộ chọn gốc của trình
// duyệt, giá trị ra luôn là `YYYY-MM-DD` hoặc ''. vitest không có `inputType` thật nên phím được khoá ở mức `fireEvent.change`; phím và con trỏ thật đo ở Chromium.

type Extra = Partial<
  Omit<ComponentProps<typeof DateField>, 'id' | 'value' | 'onChange'>
>;

function Harness({
  initial = '',
  onValue = () => undefined,
  ...extra
}: Extra & { initial?: string; onValue?: (iso: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="ngay">Ngày hẹn</label>
      <DateField
        id="ngay"
        value={value}
        onChange={(iso) => {
          setValue(iso);
          onValue(iso);
        }}
        className="field"
        {...extra}
      />
      <output data-testid="iso">{value}</output>
    </>
  );
}

const box = () => screen.getByLabelText('Ngày hẹn') as HTMLInputElement;
const iso = () => screen.getByTestId('iso').textContent;
const picker = () => document.getElementById('ngay-picker') as HTMLInputElement;
const calendarButton = () =>
  screen.getByRole('button', { name: DATE_TEXT.pickerLabel });

describe('DateField: hiển thị và thuộc tính', () => {
  it('UX1-25 giá trị ISO hiển thị dd/mm/yyyy; ô chữ có chữ gợi ý, bàn phím số, không tự điền; nhãn `htmlFor` ra đúng ô chữ', () => {
    render(<Harness initial="2026-11-24" />);

    expect(box()).toHaveValue('24/11/2026');
    expect(box()).toHaveAttribute('type', 'text');
    expect(box()).toHaveAttribute('inputmode', 'numeric');
    expect(box()).toHaveAttribute('autocomplete', 'off');
    expect(box()).toHaveAttribute('placeholder', 'dd/mm/yyyy');
    expect(box()).toHaveAttribute('maxlength', '10');
    expect(box()).toHaveClass('field');
  });

  it('UX1-25 giá trị rỗng ⇒ ô trống; giá trị không phải ngày có thật hay sai dạng ⇒ ô trống (không in "30/02/2026")', () => {
    for (const bad of ['', '2026-02-30', '2026-1-5', 'abc']) {
      const { unmount } = render(<Harness initial={bad} />);
      expect(box(), bad).toHaveValue('');
      unmount();
    }
  });

  it('UX1-26 nhãn chỉ ra MỘT phần tử (ô chữ), không nhận nút lịch hay ô ẩn', () => {
    render(<Harness />);

    const found = screen.getAllByLabelText('Ngày hẹn');
    expect(found).toHaveLength(1);
    expect(found[0]).toBe(box());
  });

  it('UX1-27 nút lịch có tên truy cập "Chọn ngày", biểu tượng trang trí, đứng SAU ô chữ trong thứ tự Tab', () => {
    render(<Harness />);

    const button = calendarButton();
    expect(button).toHaveAttribute('type', 'button');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(
      box().compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('UX1-28 `min`, `max` nằm ở ô ngày gốc ẩn (`{id}-picker`: type=date, aria-hidden, ngoài thứ tự Tab); ô chữ không có `min`, `max`', () => {
    render(<Harness min="2026-11-20" max="2027-11-20" />);

    expect(picker()).toHaveAttribute('type', 'date');
    expect(picker()).toHaveAttribute('min', '2026-11-20');
    expect(picker()).toHaveAttribute('max', '2027-11-20');
    expect(picker()).toHaveAttribute('aria-hidden', 'true');
    expect(picker()).toHaveAttribute('tabindex', '-1');
    expect(box()).not.toHaveAttribute('min');
    expect(box()).not.toHaveAttribute('max');
  });

  it('UX1-29 `required`, `aria-invalid`, `aria-describedby` của nơi gọi được chuyển vào ô chữ; không cho thì không có', () => {
    const { unmount } = render(
      <Harness required aria-invalid aria-describedby="ngay-error" />,
    );
    expect(box()).toBeRequired();
    expect(box()).toHaveAttribute('aria-invalid', 'true');
    expect(box()).toHaveAttribute('aria-describedby', 'ngay-error');
    unmount();

    render(<Harness />);
    expect(box()).not.toBeRequired();
    expect(box()).not.toHaveAttribute('aria-invalid');
    expect(box()).not.toHaveAttribute('aria-describedby');
  });

  it('UX1-29 `aria-invalid={false}` của nơi gọi (bộ lọc ngày của lịch hẹn đặt "false" khi đúng thứ tự) được giữ nguyên là "false", không bị bỏ', () => {
    render(<Harness aria-invalid={false} />);

    expect(box()).toHaveAttribute('aria-invalid', 'false');
  });

  it('UX1-30 `disabled` vô hiệu cả ô chữ, nút lịch và ô ngày gốc; `readOnly` khoá ô chữ và nút lịch', () => {
    const { unmount } = render(<Harness disabled />);
    expect(box()).toBeDisabled();
    expect(calendarButton()).toBeDisabled();
    expect(picker()).toBeDisabled();
    unmount();

    render(<Harness readOnly />);
    expect(box()).toHaveAttribute('readonly');
    expect(calendarButton()).toBeDisabled();
  });

  it('UX1-31 `inputRef` nhận đúng ô chữ (hộp Phân công đặt focus đầu vào ô "Từ ngày")', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Harness inputRef={ref} />);

    expect(ref.current).toBe(box());
    ref.current?.focus();
    expect(document.activeElement).toBe(box());
  });
});

describe('DateField: gõ', () => {
  it('UX1-32 gõ từng chữ số "24112026": onChange chỉ gọi MỘT lần, với ISO, khi đủ ngày; chữ dở dang không phát gì', () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    fillDate(box(), '2411202');
    expect(box()).toHaveValue('24/11/202');
    expect(onValue).not.toHaveBeenCalled();

    fillDate(box(), '24112026');
    expect(box()).toHaveValue('24/11/2026');
    expect(onValue).toHaveBeenCalledTimes(1);
    expect(onValue).toHaveBeenCalledWith('2026-11-24');
    expect(iso()).toBe('2026-11-24');
  });

  it('UX1-32 gõ cả dấu /: "24/11/2026" ra cùng kết quả; "5/1/2027" bù 0 thành 05/01/2027', () => {
    render(<Harness />);

    fillDate(box(), '24/11/2026');
    expect(iso()).toBe('2026-11-24');
    fillDate(box(), '5/1/2027');
    expect(box()).toHaveValue('05/01/2027');
    expect(iso()).toBe('2027-01-05');
  });

  it('UX1-33 xoá sạch ⇒ onChange("") một lần; giá trị ra CHỈ là ISO hoặc rỗng, không bao giờ là dạng dd/mm/yyyy', () => {
    const onValue = vi.fn();
    render(<Harness initial="2026-11-24" onValue={onValue} />);

    fireEvent.change(box(), { target: { value: '' } });
    expect(box()).toHaveValue('');
    expect(onValue).toHaveBeenCalledTimes(1);
    expect(onValue).toHaveBeenCalledWith('');

    fillDate(box(), '01122026');
    for (const call of onValue.mock.calls) {
      expect(call[0]).toMatch(/^(\d{4}-\d{2}-\d{2})?$/);
    }
  });

  it('UX1-34 xoá giữa chừng một chữ số của ngày đủ: ô giữ chữ dở dang ("24/1/2026"), giá trị ra "" (không đoán)', () => {
    const onValue = vi.fn();
    render(<Harness initial="2026-11-24" onValue={onValue} />);

    fireEvent.change(box(), {
      target: { value: '24/1/2026', selectionStart: 4, selectionEnd: 4 },
    });

    expect(box()).toHaveValue('24/1/2026');
    expect(onValue).toHaveBeenCalledTimes(1);
    expect(onValue).toHaveBeenCalledWith('');
  });

  it('UX1-35 ký tự lạ bị bỏ, ô giữ nguyên, không phát giá trị', () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    fillDate(box(), '24/1');
    fireEvent.change(box(), { target: { value: '24/1x' } });

    expect(box()).toHaveValue('24/1');
    expect(onValue).not.toHaveBeenCalled();
  });

  it('UX1-36 mất focus giữ nguyên chữ dở dang (không xoá, không đoán)', () => {
    render(<Harness />);

    fillDate(box(), '2411');
    fireEvent.blur(box());

    expect(box()).toHaveValue('24/11/');
    expect(iso()).toBe('');
  });
});

describe('DateField: ngày không tồn tại', () => {
  it.each([
    ['31022026', '31/02/2026', '31/02'],
    ['31042026', '31/04/2026', '31/04'],
    ['29022027', '29/02/2027', '29/02 năm không nhuận'],
  ])(
    'UX1-37 %s ⇒ giá trị "" , aria-invalid, dòng báo role=alert nối aria-describedby (%s)',
    (digits, shown) => {
      render(<Harness initial="2026-11-24" aria-describedby="ngay-error" />);

      fillDate(box(), digits);

      expect(box()).toHaveValue(shown);
      expect(iso()).toBe('');
      expect(box()).toHaveAttribute('aria-invalid', 'true');
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(DATE_TEXT.invalid);
      expect(alert).toHaveAttribute('id', 'ngay-format');
      expect(box()).toHaveAttribute(
        'aria-describedby',
        'ngay-error ngay-format',
      );
    },
  );

  it('UX1-38 ca âm: 29/02/2024 (nhuận) và ngày hợp lệ KHÔNG báo; sửa lại thành ngày đúng thì dòng báo biến mất', () => {
    render(<Harness />);

    fillDate(box(), '29022024');
    expect(iso()).toBe('2024-02-29');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(box()).not.toHaveAttribute('aria-invalid');

    fillDate(box(), '31022026');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fillDate(box(), '28022026');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(box()).not.toHaveAttribute('aria-invalid');
    expect(iso()).toBe('2026-02-28');
  });

  it('UX1-39 ngày ngoài `min` hay `max` VẪN đi ra (như ô gốc; form tự báo "ngày đã qua"), DateField không tự báo lỗi', () => {
    render(<Harness min="2026-11-20" max="2026-12-31" />);

    fillDate(box(), '19112026');
    expect(iso()).toBe('2026-11-19');
    fillDate(box(), '01012027');
    expect(iso()).toBe('2027-01-01');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(box()).not.toHaveAttribute('aria-invalid');
  });
});

describe('DateField: dán, tự điền, giá trị ngoài', () => {
  it.each([
    ['2026-11-24', '24/11/2026', '2026-11-24'],
    ['24/11/2026', '24/11/2026', '2026-11-24'],
    ['1/2/2026', '01/02/2026', '2026-02-01'],
    ['24-11-2026', '24/11/2026', '2026-11-24'],
    ['24112026', '24/11/2026', '2026-11-24'],
  ])('UX1-40 dán "%s" ⇒ ô "%s", giá trị %s', (text, shown, expected) => {
    render(<Harness />);
    box().focus();

    const notCancelled = fireEvent.paste(box(), {
      clipboardData: { getData: () => text },
    });

    expect(notCancelled).toBe(false);
    expect(box()).toHaveValue(shown);
    expect(iso()).toBe(expected);
  });

  it('UX1-40 ca âm: dán chữ, dán rỗng, dán lẫn chữ bị bỏ; ô và giá trị giữ nguyên, không phát gì', () => {
    const onValue = vi.fn();
    render(<Harness initial="2026-11-24" onValue={onValue} />);
    box().focus();

    for (const text of ['abc', '', 'ngày 24/11/2026 lúc 8h']) {
      fireEvent.paste(box(), { clipboardData: { getData: () => text } });
    }

    expect(box()).toHaveValue('24/11/2026');
    expect(onValue).not.toHaveBeenCalled();
  });

  it('UX1-41 tự điền hoặc dán ISO qua `change` (cách ~48 test cũ gõ ngày): ô hiện dd/mm/yyyy, giá trị ISO; value rỗng xoá ô', () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    fireEvent.change(box(), { target: { value: '2026-10-20' } });
    expect(box()).toHaveValue('20/10/2026');
    expect(onValue).toHaveBeenLastCalledWith('2026-10-20');

    fireEvent.change(box(), { target: { value: '' } });
    expect(box()).toHaveValue('');
    expect(onValue).toHaveBeenLastCalledWith('');
  });

  it('UX1-42 `value` đổi từ nơi gọi (đặt lại form, đổi URL) ⇒ chữ trong ô đổi theo; chữ dở dang không bị ghi đè khi nơi gọi vẽ lại với cùng giá trị', () => {
    const { rerender } = render(
      <DateField id="ngay" value="2026-11-24" onChange={() => undefined} />,
    );
    const input = () => document.getElementById('ngay') as HTMLInputElement;
    expect(input()).toHaveValue('24/11/2026');

    rerender(
      <DateField id="ngay" value="2026-12-05" onChange={() => undefined} />,
    );
    expect(input()).toHaveValue('05/12/2026');

    rerender(<DateField id="ngay" value="" onChange={() => undefined} />);
    expect(input()).toHaveValue('');
  });

  it('UX1-42 chữ dở dang không bị ghi đè khi nơi gọi vẽ lại với cùng `value` rỗng (người dùng đang gõ giữa chừng)', () => {
    const { rerender } = render(<Harness />);
    fillDate(box(), '2411');

    rerender(<Harness />);

    expect(box()).toHaveValue('24/11/');
  });
});

describe('DateField: nút lịch (bộ chọn gốc)', () => {
  it('UX1-43 bấm nút gọi `showPicker()` của ô gốc ẩn; không phát giá trị', () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const showPicker = vi.fn();
    picker().showPicker = showPicker;

    fireEvent.click(calendarButton());

    expect(showPicker).toHaveBeenCalledTimes(1);
    expect(onValue).not.toHaveBeenCalled();
  });

  it('UX1-43 dự phòng: trình duyệt không có `showPicker` hoặc `showPicker` ném lỗi ⇒ `focus()` rồi `click()` ô gốc, không vỡ trang', () => {
    render(<Harness />);
    const click = vi.spyOn(picker(), 'click');

    (picker() as { showPicker?: unknown }).showPicker = undefined;
    fireEvent.click(calendarButton());
    expect(click).toHaveBeenCalledTimes(1);

    picker().showPicker = () => {
      throw new DOMException('cần thao tác của người dùng', 'NotAllowedError');
    };
    fireEvent.click(calendarButton());
    expect(click).toHaveBeenCalledTimes(2);
  });

  it('UX1-44 chọn ngày trong bộ chọn gốc ⇒ ô hiện dd/mm/yyyy, giá trị ISO, focus về ô chữ; chọn "Xoá" trong bộ chọn ⇒ rỗng', () => {
    const onValue = vi.fn();
    render(<Harness initial="2026-11-24" onValue={onValue} />);

    fireEvent.change(picker(), { target: { value: '2026-12-01' } });
    expect(box()).toHaveValue('01/12/2026');
    expect(onValue).toHaveBeenLastCalledWith('2026-12-01');
    expect(document.activeElement).toBe(box());

    fireEvent.change(picker(), { target: { value: '' } });
    expect(box()).toHaveValue('');
    expect(onValue).toHaveBeenLastCalledWith('');
  });
});

// Lỗ hổng do đột biến M20 chỉ ra (19/11/2026): hàm thuần `applyDateChange` đã khoá con trỏ, nhưng không test nào kiểm phần NỐI vào ô
// (`commit` đặt `selectionStart` bằng `setSelectionRange`). Gán `input.value` bằng CHÍNH chữ đang có trong ô không đổi con trỏ (cả ở trình duyệt thật),
// nên chỉ ca mà mặt nạ ĐỔI chữ ở giữa chuỗi (vd "24/101/2026" ra "24/10/1202") mới cần `setSelectionRange`: đó là ca bắt M20 (lần đầu viết các ca
// chữ trùng chữ vừa gõ thì M20 vẫn sống). Các ca còn lại khoá đường F1 ở mức thành phần. `price-input.test.tsx` khoá `selectionStart` ở happy-dom.
describe('DateField: con trỏ sau khi sửa giữa chừng (UX1-44b)', () => {
  const change = (value: string, caret: number) =>
    fireEvent.change(box(), {
      target: { value, selectionStart: caret, selectionEnd: caret },
    });

  it('UX1-44b thay MỘT chữ số giữa ngày đủ ("24/11/2026" ra "24/21/2026", con trỏ 4): con trỏ của ô ở lại 4, không nhảy về cuối (10)', () => {
    render(<Harness initial="2026-11-24" />);

    change('24/21/2026', 4);

    expect(box()).toHaveValue('24/21/2026');
    expect(box().selectionStart).toBe(4);
    expect(box().selectionEnd).toBe(4);
  });

  it('UX1-44b chèn "1" vào "24/1/2026" ở vị trí 4 (ra "24/11/2026"): con trỏ của ô ở 5; xoá rồi gõ lại cũng vậy', () => {
    render(<Harness initial="2026-11-24" />);

    change('24/1/2026', 4);
    expect(box()).toHaveValue('24/1/2026');
    expect(box().selectionStart).toBe(4);

    change('24/11/2026', 5);
    expect(box()).toHaveValue('24/11/2026');
    expect(box().selectionStart).toBe(5);
    expect(box().selectionEnd).toBe(5);
  });

  it('UX1-44b mặt nạ ĐỔI chữ ở giữa chuỗi ("24/11/2026" chèn "0" ở vị trí 4 ra "24/101/2026", mặt nạ dựng lại "24/10/1202"): con trỏ của ô ở 5 (sau chữ số thứ tư), không về cuối (10)', () => {
    render(<Harness initial="2026-11-24" />);

    change('24/101/2026', 5);

    expect(box()).toHaveValue('24/10/1202');
    expect(box().selectionStart).toBe(5);
    expect(box().selectionEnd).toBe(5);
  });

  it('UX1-44b ca đối chứng: gõ ở CUỐI thì con trỏ ở cuối (10)', () => {
    render(<Harness />);

    fillDate(box(), '24112026');

    expect(box()).toHaveValue('24/11/2026');
    expect(box().selectionStart).toBe(10);
  });
});
