import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { StarInput } from './star-input';

// doctor-exam F6, WDG-02, WDG-15, WDG-17 [đề xuất]: ô chọn số sao theo mẫu WAI-ARIA radio group (Figma `423:2`). happy-dom không đo kích thước: khoá TÊN LỚP (MỖI lớp một khẳng định, AI-BUG-052); kích thước thật và phím trên Chromium đo ở TRACKING 24.8.
function Harness({
  initial = null,
  onChange,
  disabled,
  invalid,
  autoFocus,
}: {
  initial?: number | null;
  onChange?: (stars: number) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <>
      <span id="legend">Số sao</span>
      <StarInput
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
        labelledBy="legend"
        describedBy="err"
        invalid={invalid}
        disabled={disabled}
        autoFocus={autoFocus}
      />
      <p id="err">Lỗi giả</p>
    </>
  );
}

const radio = (stars: number) =>
  screen.getByRole('radio', { name: `${stars} sao` });
const radios = () => screen.getAllByRole('radio');
const checked = () =>
  radios()
    .map((element, index) =>
      element.getAttribute('aria-checked') === 'true' ? index + 1 : null,
    )
    .filter((value) => value !== null);

describe('doctor-exam F6 — ô sao: cấu trúc radiogroup (WDG-02)', () => {
  it('WDG-02 `radiogroup` có tên "Số sao" và năm `radio` tên "1 sao" … "5 sao"; chưa chọn thì không ô nào `aria-checked`', () => {
    render(<Harness />);
    expect(
      screen.getByRole('radiogroup', { name: 'Số sao' }),
    ).toBeInTheDocument();
    expect(
      radios().map((element) => element.getAttribute('aria-label')),
    ).toEqual(['1 sao', '2 sao', '3 sao', '4 sao', '5 sao']);
    expect(checked()).toEqual([]);
    expect(screen.getByRole('radiogroup')).toHaveAttribute(
      'aria-required',
      'true',
    );
  });

  it('WDG-15 roving tabindex: chưa chọn thì CHỈ ô đầu nằm trong Tab; đã chọn thì CHỈ ô đang chọn', () => {
    render(<Harness />);
    expect(radios().map((element) => element.tabIndex)).toEqual([
      0, -1, -1, -1, -1,
    ]);
    fireEvent.click(radio(4));
    expect(radios().map((element) => element.tabIndex)).toEqual([
      -1, -1, -1, 0, -1,
    ]);
  });

  it('WDG-15 mô tả và lỗi: `aria-describedby` trỏ tới đoạn lỗi; `aria-invalid` chỉ khi `invalid`', () => {
    const { rerender } = render(<Harness />);
    const group = screen.getByRole('radiogroup');
    expect(group).toHaveAccessibleDescription('Lỗi giả');
    expect(group).not.toHaveAttribute('aria-invalid');
    rerender(<Harness invalid />);
    expect(screen.getByRole('radiogroup')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });
});

describe('doctor-exam F6 — ô sao: chuột, chạm và bàn phím (WDG-02, WDG-15)', () => {
  it('WDG-02 bấm chuột vào sao ⇒ đúng MỘT ô `aria-checked`, `onChange` nhận số sao đó', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(radio(3));
    expect(checked()).toEqual([3]);
    expect(onChange).toHaveBeenCalledWith(3);
    fireEvent.click(radio(5));
    expect(checked()).toEqual([5]);
  });

  it('WDG-02 chạm (touch/pointer rồi click như trình duyệt di động): chọn khi `click`, KHÔNG chọn chỉ vì `pointerdown`', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.pointerDown(radio(2), { pointerType: 'touch' });
    fireEvent.touchStart(radio(2));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.touchEnd(radio(2));
    fireEvent.pointerUp(radio(2), { pointerType: 'touch' });
    fireEvent.click(radio(2));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(checked()).toEqual([2]);
  });

  it('WDG-02 → và ↓ đổi sang sao kế VÀ chuyển tiêu điểm theo; có vòng 5 → 1', () => {
    render(<Harness initial={3} />);
    radio(3).focus();
    fireEvent.keyDown(radio(3), { key: 'ArrowRight' });
    expect(checked()).toEqual([4]);
    expect(document.activeElement).toBe(radio(4));
    fireEvent.keyDown(radio(4), { key: 'ArrowDown' });
    expect(checked()).toEqual([5]);
    expect(document.activeElement).toBe(radio(5));
    fireEvent.keyDown(radio(5), { key: 'ArrowRight' });
    expect(checked()).toEqual([1]);
    expect(document.activeElement).toBe(radio(1));
  });

  it('WDG-02 ← và ↑ đổi sang sao trước VÀ chuyển tiêu điểm theo; có vòng 1 → 5', () => {
    render(<Harness initial={2} />);
    radio(2).focus();
    fireEvent.keyDown(radio(2), { key: 'ArrowLeft' });
    expect(checked()).toEqual([1]);
    expect(document.activeElement).toBe(radio(1));
    fireEvent.keyDown(radio(1), { key: 'ArrowUp' });
    expect(checked()).toEqual([5]);
    expect(document.activeElement).toBe(radio(5));
  });

  it('WDG-02 Home về 1 sao, End về 5 sao (kèm tiêu điểm)', () => {
    render(<Harness initial={3} />);
    radio(3).focus();
    fireEvent.keyDown(radio(3), { key: 'End' });
    expect(checked()).toEqual([5]);
    expect(document.activeElement).toBe(radio(5));
    fireEvent.keyDown(radio(5), { key: 'Home' });
    expect(checked()).toEqual([1]);
    expect(document.activeElement).toBe(radio(1));
  });

  it('WDG-02 phím khác (Tab, chữ, Escape) KHÔNG đổi sao và KHÔNG chặn hành vi mặc định (Tab ra khỏi nhóm)', () => {
    render(<Harness initial={3} />);
    radio(3).focus();
    for (const key of ['Tab', 'a', 'Escape', 'PageDown']) {
      const notPrevented = fireEvent.keyDown(radio(3), { key });
      expect(notPrevented).toBe(true);
    }
    expect(checked()).toEqual([3]);
    expect(document.activeElement).toBe(radio(3));
  });

  it('WDG-02 phím mũi tên bị `preventDefault` (không cuộn trang)', () => {
    render(<Harness initial={3} />);
    radio(3).focus();
    expect(fireEvent.keyDown(radio(3), { key: 'ArrowRight' })).toBe(false);
  });

  it('WDG-15 `autoFocus` đưa tiêu điểm vào ô nằm trong Tab: ô đầu khi chưa chọn, ô đang chọn khi đã chọn; không có thì không lấy tiêu điểm', () => {
    const { unmount } = render(<Harness autoFocus />);
    expect(document.activeElement).toBe(radio(1));
    unmount();
    const second = render(<Harness autoFocus initial={4} />);
    expect(document.activeElement).toBe(radio(4));
    second.unmount();
    render(<Harness />);
    expect(document.activeElement).toBe(document.body);
  });

  it('WDG-15 `disabled` khoá cả năm ô và bấm không đổi sao', () => {
    const onChange = vi.fn();
    render(<Harness disabled onChange={onChange} />);
    for (const element of radios()) expect(element).toBeDisabled();
    fireEvent.click(radio(4));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('doctor-exam F6 — ô sao: khoá tên lớp (WDG-17)', () => {
  it('WDG-17 ô sao 33,75 (`size-9`; gốc 15 px nên 2,25 rem; đo Chromium 33,75 đúng Figma), biểu tượng 22,5 (`size-6`), bo `rounded-[9.375px]`; ô cách nhau `gap-0.5` (Figma `423:411`)', () => {
    render(<Harness />);
    const first = radio(1);
    expect(first).toHaveClass('size-9');
    expect(first).toHaveClass('rounded-[9.375px]');
    expect(first.querySelector('svg')).toHaveClass('size-6');
    expect(screen.getByRole('radiogroup')).toHaveClass('gap-0.5');
  });

  it('WDG-17 sao ĐẶC từ 1 tới số đã chọn: `fill-current` và `text-amber-600`; sao còn lại là viền `text-gray-500` (ký hiệu ≥ 3:1, ADR 0004)', () => {
    render(<Harness initial={3} />);
    [1, 2, 3].forEach((stars) => {
      const icon = radio(stars).querySelector('svg');
      expect(icon).toHaveClass('fill-current');
      expect(icon).toHaveClass('text-amber-600');
      expect(icon).not.toHaveClass('text-gray-500');
    });
    [4, 5].forEach((stars) => {
      const icon = radio(stars).querySelector('svg');
      expect(icon).toHaveClass('text-gray-500');
      expect(icon).not.toHaveClass('fill-current');
      expect(icon).not.toHaveClass('text-amber-600');
    });
  });

  it('WDG-17 biểu tượng sao `aria-hidden` (tên truy cập nằm ở nút)', () => {
    render(<Harness initial={1} />);
    for (const element of radios()) {
      expect(element.querySelector('svg')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
    }
  });
});
