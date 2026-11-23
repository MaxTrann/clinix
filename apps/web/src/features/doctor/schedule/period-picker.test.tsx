import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { formatMonthLabel, monthStartOf } from '../../../shared/schedule/month';
import {
  formatWeekRange,
  formatWeekdayDate,
  weekStartOf,
} from '../../../shared/schedule/week';
import { PeriodPicker } from './period-picker';

// doctor UX5 (G2): hộp chọn tuần/tháng mở từ nhãn kỳ. Mã DUX5-nn [đề xuất]; WL-03 = chuyển kỳ, WL-12 [đề xuất] = hộp chọn kỳ.
// Hôm nay là prop (không đọc đồng hồ). Mặc định: đang xem tuần 16/11 – 22/11/2026 (neo 18/11), hôm nay 23/11/2026 (thứ Hai, KHÔNG thuộc tuần đang xem).

type Mode = 'week' | 'month';

function labelOf(mode: Mode, anchor: string): string {
  return mode === 'week'
    ? `Tuần ${formatWeekRange(weekStartOf(anchor))}`
    : formatMonthLabel(monthStartOf(anchor));
}

interface HarnessProps {
  mode?: Mode;
  anchor?: string;
  today?: string;
  onPick?: (isoDate: string) => void;
}

// Như trang thật: `onPick` đổi ngày neo, nhãn đổi theo
function Harness({
  mode = 'week',
  anchor: initial = '2026-11-18',
  today = '2026-11-23',
  onPick,
}: HarnessProps) {
  const [anchor, setAnchor] = useState(initial);
  return (
    <PeriodPicker
      mode={mode}
      label={labelOf(mode, anchor)}
      anchor={anchor}
      today={today}
      onPick={(value) => {
        onPick?.(value);
        setAnchor(value);
      }}
    />
  );
}

// Nút nhãn: khi hộp mở, nền (cả nút) là `inert` nên phải gọi với `hidden`
const trigger = () =>
  screen.getByRole('button', { name: /mở hộp chọn/, hidden: true });
const dialog = () => screen.getByRole('dialog');
const grid = () => within(dialog()).getByRole('grid');
const cell = (iso: string) =>
  within(dialog()).getByRole('gridcell', { name: formatWeekdayDate(iso) });
const monthCell = (monthStart: string) =>
  within(dialog()).getByRole('gridcell', {
    name: formatMonthLabel(monthStart),
  });
const caption = () => within(dialog()).getByText(/^(Tháng \d+ năm|Năm) \d+$/);
const stops = () =>
  within(grid())
    .getAllByRole('gridcell')
    .filter((element) => element.getAttribute('tabindex') === '0');

function open() {
  fireEvent.click(trigger());
}

// Phím gửi vào phần tử đang giữ focus; trả `false` nếu mã đã `preventDefault`
function press(key: string, init: KeyboardEventInit = {}): boolean {
  const target = document.activeElement ?? document.body;
  return fireEvent.keyDown(target, { key, ...init });
}

describe('nút nhãn kỳ', () => {
  it('DUX5-20 WL-12 tên nút gồm chữ đang thấy và "mở hộp chọn tuần/tháng"; aria-haspopup, aria-expanded; chữ nhãn đúng MỘT phần tử', () => {
    const { rerender } = render(<Harness />);

    const week = screen.getByRole('button', {
      name: 'Tuần 16/11 – 22/11/2026, mở hộp chọn tuần',
    });
    expect(week).toHaveAttribute('aria-haspopup', 'dialog');
    expect(week).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByText('Tuần 16/11 – 22/11/2026')).toHaveLength(1);
    expect(screen.queryByRole('dialog')).toBeNull();

    rerender(<Harness mode="month" />);
    const month = screen.getByRole('button', {
      name: 'Tháng 11 năm 2026, mở hộp chọn tháng',
    });
    expect(month).toHaveAttribute('aria-haspopup', 'dialog');
    expect(month).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByText('Tháng 11 năm 2026')).toHaveLength(1);
  });
});

describe('mở và đóng', () => {
  it('DUX5-21 WL-12 bấm nhãn: hộp "Chọn tuần" (role dialog, aria-modal), aria-expanded=true, focus ở ô ngày đang xem, nền inert', () => {
    const { container } = render(<Harness />);
    open();

    const box = dialog();
    expect(box).toHaveAccessibleName('Chọn tuần');
    expect(box).toHaveAttribute('aria-modal', 'true');
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(cell('2026-11-18')).toHaveFocus();
    expect(container).toHaveAttribute('inert');
  });

  it('DUX5-21 chế độ Tháng: hộp "Chọn tháng", focus ở tháng đang xem', () => {
    render(<Harness mode="month" />);
    open();

    expect(dialog()).toHaveAccessibleName('Chọn tháng');
    expect(monthCell('2026-11-01')).toHaveFocus();
  });

  it('DUX5-22 WL-12 Esc đóng hộp, trả focus về nút nhãn, aria-expanded=false, không chọn gì', () => {
    const onPick = vi.fn();
    const { container } = render(<Harness onPick={onPick} />);
    open();

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(container).not.toHaveAttribute('inert');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('DUX5-23 WL-12 bấm nền mờ và nút "Đóng hộp thoại" cũng đóng và trả focus về nút nhãn', () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);

    open();
    fireEvent.click(dialog().parentElement as HTMLElement);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger()).toHaveFocus();

    open();
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Đóng hộp thoại' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('DUX5-35 mở lại sau khi đóng bắt đầu lại ở kỳ đang xem (không giữ tháng đã lật dở)', () => {
    render(<Harness />);
    open();
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Xem tháng sau' }),
    );
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Xem tháng sau' }),
    );
    expect(caption()).toHaveTextContent('Tháng 1 năm 2027');
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });

    open();
    expect(caption()).toHaveTextContent('Tháng 11 năm 2026');
    expect(cell('2026-11-18')).toHaveFocus();
  });

  it('DUX5-34 đổi chế độ khi hộp đóng đổi tên nút và hộp mở ra đúng loại', () => {
    const { rerender } = render(<Harness />);
    rerender(<Harness mode="month" />);

    expect(trigger()).toHaveAccessibleName(
      'Tháng 11 năm 2026, mở hộp chọn tháng',
    );
    open();
    expect(dialog()).toHaveAccessibleName('Chọn tháng');
    expect(within(dialog()).getAllByRole('gridcell')).toHaveLength(12);
  });
});

describe('lưới ngày (chế độ Tuần)', () => {
  it('DUX5-24 WL-11, WL-12 tiêu đề tháng, cột T2 đến CN, 6 hàng của tháng 11/2026, MỘT ô hôm nay, bảy ô của tuần đang xem, ngày tháng liền kề có mặt', () => {
    render(<Harness />);
    open();

    const title = caption();
    expect(title).toHaveTextContent('Tháng 11 năm 2026');
    expect(title).toHaveAttribute('aria-live', 'polite');
    expect(
      within(grid())
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN']);
    // 1 hàng tiêu đề + 6 tuần (26/10 … 06/12); đúng 42 ô ngày
    expect(within(grid()).getAllByRole('row')).toHaveLength(7);
    expect(within(grid()).getAllByRole('gridcell')).toHaveLength(42);

    const today = within(grid())
      .getAllByRole('gridcell')
      .filter((element) => element.getAttribute('aria-current') === 'date');
    expect(today).toHaveLength(1);
    expect(today[0]).toHaveAccessibleName('Thứ 2, 23/11/2026');

    const viewed = within(grid()).getAllByRole('gridcell', { selected: true });
    expect(viewed.map((element) => element.getAttribute('aria-label'))).toEqual(
      [
        'Thứ 2, 16/11/2026',
        'Thứ 3, 17/11/2026',
        'Thứ 4, 18/11/2026',
        'Thứ 5, 19/11/2026',
        'Thứ 6, 20/11/2026',
        'Thứ 7, 21/11/2026',
        'CN, 22/11/2026',
      ],
    );

    expect(cell('2026-10-26')).toBeInTheDocument();
    expect(cell('2026-12-06')).toBeInTheDocument();
  });

  it('DUX5-25 WL-03, WL-12 chọn ngày bằng chuột, Enter và Space: onPick đúng chuỗi ISO, hộp đóng, focus về nút nhãn, nhãn đổi (Chủ nhật và ngày tháng liền kề)', () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);

    // Chuột, ngày Chủ nhật
    open();
    fireEvent.click(cell('2026-11-29'));
    expect(onPick).toHaveBeenLastCalledWith('2026-11-29');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAccessibleName(
      'Tuần 23/11 – 29/11/2026, mở hộp chọn tuần',
    );

    // Enter: neo mới 29/11 → sang 30/11 rồi Enter
    open();
    expect(cell('2026-11-29')).toHaveFocus();
    press('ArrowRight');
    expect(cell('2026-11-30')).toHaveFocus();
    press('Enter');
    expect(onPick).toHaveBeenLastCalledWith('2026-11-30');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger()).toHaveFocus();

    // Space, rồi ngày của tháng liền kề bằng chuột
    open();
    press('ArrowDown');
    press(' ');
    expect(onPick).toHaveBeenLastCalledWith('2026-12-07');
    open();
    fireEvent.click(cell('2026-11-30'));
    expect(onPick).toHaveBeenLastCalledWith('2026-11-30');
    expect(onPick).toHaveBeenCalledTimes(4);
  });

  it('DUX5-26 WL-12 nút "Xem tháng trước/sau" đổi tháng và tiêu đề, KHÔNG đóng hộp, KHÔNG chọn, focus ở yên trên nút, qua năm', () => {
    const onPick = vi.fn();
    render(<Harness anchor="2026-12-15" onPick={onPick} />);
    open();

    const next = within(dialog()).getByRole('button', {
      name: 'Xem tháng sau',
    });
    next.focus();
    fireEvent.click(next);
    expect(caption()).toHaveTextContent('Tháng 1 năm 2027');
    expect(next).toHaveFocus();
    // điểm dừng Tab của lưới theo sang tháng mới (cùng ngày 15)
    expect(
      stops().map((element) => element.getAttribute('aria-label')),
    ).toEqual([formatWeekdayDate('2027-01-15')]);

    const previous = within(dialog()).getByRole('button', {
      name: 'Xem tháng trước',
    });
    fireEvent.click(previous);
    fireEvent.click(previous);
    expect(caption()).toHaveTextContent('Tháng 11 năm 2026');
    expect(dialog()).toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('DUX5-27 WL-12 phím trong lưới ngày: MỘT điểm dừng Tab; ← → ↑ ↓, Home, End, PageUp/PageDown, Shift+PageUp/PageDown đưa focus thật tới đúng ô và đã preventDefault', () => {
    render(<Harness />);
    open();

    expect(stops()).toEqual([cell('2026-11-18')]);
    expect(cell('2026-11-18')).toHaveFocus();

    const moves: [string, KeyboardEventInit, string][] = [
      ['ArrowRight', {}, '2026-11-19'],
      ['ArrowDown', {}, '2026-11-26'],
      ['ArrowLeft', {}, '2026-11-25'],
      ['ArrowUp', {}, '2026-11-18'],
      ['End', {}, '2026-11-22'],
      ['Home', {}, '2026-11-16'],
    ];
    for (const [key, init, expected] of moves) {
      expect(press(key, init), `${key} phải preventDefault`).toBe(false);
      expect(cell(expected), `${key}`).toHaveFocus();
      expect(stops()).toEqual([cell(expected)]);
    }

    // PageDown sang tháng 12 (cùng ngày 16), PageUp về lại
    expect(press('PageDown')).toBe(false);
    expect(caption()).toHaveTextContent('Tháng 12 năm 2026');
    expect(cell('2026-12-16')).toHaveFocus();
    expect(press('PageUp')).toBe(false);
    expect(caption()).toHaveTextContent('Tháng 11 năm 2026');
    expect(cell('2026-11-16')).toHaveFocus();

    // Shift+PageDown: sang năm sau
    expect(press('PageDown', { shiftKey: true })).toBe(false);
    expect(caption()).toHaveTextContent('Tháng 11 năm 2027');
    expect(cell('2027-11-16')).toHaveFocus();

    // Phím khác không bị nuốt
    expect(press('a')).toBe(true);
  });

  it('DUX5-27 mũi tên qua biên tháng: 30/11 → 01/12 đổi tiêu đề và focus theo', () => {
    render(<Harness anchor="2026-11-30" />);
    open();

    press('ArrowRight');

    expect(caption()).toHaveTextContent('Tháng 12 năm 2026');
    expect(cell('2026-12-01')).toHaveFocus();
  });

  it('DUX5-28 Tab và Shift+Tab xoay vòng TRONG hộp; trong hộp không có nút tabindex=-1 (hook của khung tính mọi nút chưa disabled là điểm dừng)', () => {
    render(<Harness />);
    open();

    // Ba nút (×, ‹, ›) + MỘT ô lưới có tabindex=0
    expect(
      within(dialog())
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Đóng hộp thoại', 'Xem tháng trước', 'Xem tháng sau']);

    expect(cell('2026-11-18')).toHaveFocus();
    press('Tab');
    expect(
      within(dialog()).getByRole('button', { name: 'Đóng hộp thoại' }),
    ).toHaveFocus();
    press('Tab', { shiftKey: true });
    expect(cell('2026-11-18')).toHaveFocus();
  });

  it('DUX5-29 WL-12 biên 2000: ô 27/12/1999 của lưới bị tắt, không chọn được; "Xem tháng trước" aria-disabled và không đổi tháng; ← ở 01/01/2000 ở yên', () => {
    const onPick = vi.fn();
    render(<Harness anchor="2000-01-10" onPick={onPick} />);
    open();

    expect(caption()).toHaveTextContent('Tháng 1 năm 2000');
    expect(cell('1999-12-27')).toHaveAttribute('aria-disabled', 'true');
    expect(cell('1999-12-27')).not.toHaveAttribute('tabindex');
    fireEvent.click(cell('1999-12-27'));
    expect(onPick).not.toHaveBeenCalled();
    expect(cell('2000-01-01')).not.toHaveAttribute('aria-disabled', 'true');

    const previous = within(dialog()).getByRole('button', {
      name: 'Xem tháng trước',
    });
    expect(previous).toHaveAttribute('aria-disabled', 'true');
    previous.focus();
    fireEvent.click(previous);
    expect(caption()).toHaveTextContent('Tháng 1 năm 2000');
    expect(previous).toHaveFocus();

    // 10/01/2000 là thứ Hai: ↑ về 03/01, ↑ nữa sẽ ra 27/12/1999 nên kẹp về 01/01/2000; ← và Home ở 01/01/2000 ở yên
    cell('2000-01-10').focus();
    press('ArrowUp');
    expect(cell('2000-01-03')).toHaveFocus();
    press('ArrowUp');
    expect(cell('2000-01-01')).toHaveFocus();
    press('ArrowLeft');
    expect(cell('2000-01-01')).toHaveFocus();
    press('Home');
    expect(cell('2000-01-01')).toHaveFocus();
    expect(caption()).toHaveTextContent('Tháng 1 năm 2000');
  });

  it('DUX5-29 biên 2099: "Xem tháng sau" aria-disabled, ô 03/01/2100 tắt; neo ngoài khoảng mở ở đúng biên', () => {
    const { unmount } = render(<Harness anchor="2099-12-20" />);
    open();
    expect(caption()).toHaveTextContent('Tháng 12 năm 2099');
    expect(
      within(dialog()).getByRole('button', { name: 'Xem tháng sau' }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(cell('2100-01-03')).toHaveAttribute('aria-disabled', 'true');
    unmount();

    // neo năm 2150: mở ở tháng 12/2099, focus ở 31/12/2099
    const second = render(<Harness anchor="2150-05-05" />);
    open();
    expect(caption()).toHaveTextContent('Tháng 12 năm 2099');
    expect(cell('2099-12-31')).toHaveFocus();
    second.unmount();

    // neo năm 1950: mở ở tháng 01/2000, focus ở 01/01/2000
    render(<Harness anchor="1950-05-05" />);
    open();
    expect(caption()).toHaveTextContent('Tháng 1 năm 2000');
    expect(cell('2000-01-01')).toHaveFocus();
  });
});

describe('lưới 12 tháng (chế độ Tháng)', () => {
  it('DUX5-30 WL-12 tiêu đề "Năm 2026", 12 ô theo thứ tự, tháng đang xem aria-selected, tháng hiện tại aria-current', () => {
    // Hôm nay 14/10/2026: tháng hiện tại (10) KHÁC tháng đang xem (11)
    render(<Harness mode="month" today="2026-10-14" />);
    open();

    expect(caption()).toHaveTextContent('Năm 2026');
    expect(caption()).toHaveAttribute('aria-live', 'polite');
    const cells = within(grid()).getAllByRole('gridcell');
    expect(cells.map((element) => element.getAttribute('aria-label'))).toEqual(
      Array.from({ length: 12 }, (_, index) => `Tháng ${index + 1} năm 2026`),
    );
    expect(cells.map((element) => element.textContent)).toEqual(
      Array.from({ length: 12 }, (_, index) => `Tháng ${index + 1}`),
    );
    expect(
      within(grid())
        .getAllByRole('gridcell', { selected: true })
        .map((element) => element.getAttribute('aria-label')),
    ).toEqual(['Tháng 11 năm 2026']);
    expect(
      cells
        .filter((element) => element.getAttribute('aria-current') === 'date')
        .map((element) => element.getAttribute('aria-label')),
    ).toEqual(['Tháng 10 năm 2026']);
  });

  it('DUX5-31 WL-12 chọn từng tháng 1 đến 12: onPick đúng đầu tháng (không lệch một tháng), hộp đóng, focus về nút nhãn', () => {
    for (let month = 1; month <= 12; month += 1) {
      const text = String(month).padStart(2, '0');
      const onPick = vi.fn();
      const { unmount } = render(<Harness mode="month" onPick={onPick} />);
      open();

      fireEvent.click(monthCell(`2026-${text}-01`));

      expect(onPick, `tháng ${month}`).toHaveBeenCalledExactlyOnceWith(
        `2026-${text}-01`,
      );
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(trigger()).toHaveFocus();
      unmount();
    }
  });

  it('DUX5-32 WL-12 "Xem năm trước/sau" đổi năm, KHÔNG đóng hộp; chọn tháng theo năm đang hiện; aria-disabled ở 2000 và 2099', () => {
    const onPick = vi.fn();
    const { unmount } = render(<Harness mode="month" onPick={onPick} />);
    open();

    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Xem năm sau' }),
    );
    expect(caption()).toHaveTextContent('Năm 2027');
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.click(monthCell('2027-03-01'));
    expect(onPick).toHaveBeenCalledExactlyOnceWith('2027-03-01');

    open();
    const previous = () =>
      within(dialog()).getByRole('button', { name: 'Xem năm trước' });
    fireEvent.click(previous());
    fireEvent.click(previous());
    expect(caption()).toHaveTextContent('Năm 2025');
    unmount();

    const low = render(<Harness mode="month" anchor="2000-05-10" />);
    open();
    const first = within(dialog()).getByRole('button', {
      name: 'Xem năm trước',
    });
    expect(first).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(first);
    expect(caption()).toHaveTextContent('Năm 2000');
    low.unmount();

    render(<Harness mode="month" anchor="2099-03-10" />);
    open();
    expect(
      within(dialog()).getByRole('button', { name: 'Xem năm sau' }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('DUX5-33 WL-12 phím trong lưới tháng: MỘT điểm dừng Tab; ← → ±1, ↑ ↓ ±3, Home/End, PageUp/PageDown đổi năm; đã preventDefault', () => {
    render(<Harness mode="month" />);
    open();

    expect(stops()).toEqual([monthCell('2026-11-01')]);
    // [phím, tháng nhận focus, tiêu đề năm sau phím]
    const moves: [string, string, string][] = [
      ['ArrowLeft', '2026-10-01', 'Năm 2026'],
      ['ArrowRight', '2026-11-01', 'Năm 2026'],
      ['ArrowDown', '2027-02-01', 'Năm 2027'],
      ['ArrowUp', '2026-11-01', 'Năm 2026'],
      ['Home', '2026-01-01', 'Năm 2026'],
      ['End', '2026-12-01', 'Năm 2026'],
      ['PageDown', '2027-12-01', 'Năm 2027'],
      ['PageUp', '2026-12-01', 'Năm 2026'],
    ];
    for (const [key, expected, year] of moves) {
      expect(press(key), `${key} phải preventDefault`).toBe(false);
      expect(monthCell(expected), key).toHaveFocus();
      expect(stops()).toEqual([monthCell(expected)]);
      expect(caption(), key).toHaveTextContent(year);
    }
    expect(press('a')).toBe(true);
  });
});
