import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DateStrip } from './date-strip';
import { slotWindow } from './slot-dates';

// search PR-C2, mã ca SLT-40 đến SLT-44: dải "Ngày khám" 7 thẻ (Figma 446:165). 17/11/2026 là Thứ Ba. Kích thước thật (cuộn ngang ở 375 px) chỉ Chromium thấy.
const TODAY = '2026-11-17';

function setup(value = TODAY, today = TODAY, props = {}) {
  const onChange = vi.fn();
  render(
    <DateStrip
      dates={slotWindow(today)}
      value={value}
      today={today}
      onChange={onChange}
      {...props}
    />,
  );
  return { onChange, group: screen.getByRole('group', { name: 'Ngày khám' }) };
}

describe('DateStrip', () => {
  it('SLT-40 nhóm "Ngày khám" có 7 nút, tên truy cập đủ thứ và ngày, thứ tự từ hôm nay', () => {
    const { group } = setup();
    const names = within(group)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(names).toEqual([
      'Hôm nay, Thứ Ba 17/11',
      'Thứ Tư 18/11',
      'Thứ Năm 19/11',
      'Thứ Sáu 20/11',
      'Thứ Bảy 21/11',
      'Chủ nhật 22/11',
      'Thứ Hai 23/11',
    ]);
  });

  it('SLT-40 chữ hiện ra: "Hôm nay" chỉ ở thẻ đầu, rồi T4…T7, CN, T2; số ngày; "Th11"', () => {
    const { group } = setup();
    const buttons = within(group).getAllByRole('button');
    const visible = buttons.map((button) => button.textContent);
    expect(visible).toEqual([
      'Hôm nay17Th11',
      'T418Th11',
      'T519Th11',
      'T620Th11',
      'T721Th11',
      'CN22Th11',
      'T223Th11',
    ]);
    expect(screen.getAllByText('Hôm nay')).toHaveLength(1);
  });

  it('SLT-40 qua ranh tháng: số ngày và nhãn tháng đúng ("Th11" rồi "Th12")', () => {
    const { group } = setup('2026-11-28', '2026-11-28');
    const visible = within(group)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(visible.slice(2)).toEqual([
      'T230Th11',
      'T31Th12',
      'T42Th12',
      'T53Th12',
      'T64Th12',
    ]);
  });

  it('SLT-41 đúng MỘT nút `aria-pressed`, là ngày đang xem; đổi `value` thì đổi nút', () => {
    const { group } = setup('2026-11-19');
    const pressed = within(group)
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Thứ Năm 19/11',
    ]);
    expect(
      within(group)
        .getAllByRole('button')
        .filter((button) => button.getAttribute('aria-pressed') === 'false'),
    ).toHaveLength(6);
  });

  it('SLT-42 bấm một thẻ ⇒ `onChange` với ngày ISO của thẻ đó (kể cả hôm nay)', () => {
    const { group, onChange } = setup();
    fireEvent.click(
      within(group).getByRole('button', { name: 'Thứ Sáu 20/11' }),
    );
    expect(onChange).toHaveBeenLastCalledWith('2026-11-20');
    fireEvent.click(
      within(group).getByRole('button', { name: 'Hôm nay, Thứ Ba 17/11' }),
    );
    expect(onChange).toHaveBeenLastCalledWith('2026-11-17');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('SLT-43 nút thường (không gửi form), nhận focus bằng bàn phím', () => {
    const { group } = setup();
    for (const button of within(group).getAllByRole('button')) {
      expect(button).toHaveAttribute('type', 'button');
      button.focus();
      expect(button).toHaveFocus();
    }
  });

  it('SLT-44 chú thích "Đang xem lịch …" chỉ khi bật (chi tiết chuyên khoa, Figma 259:2) và theo ngày đang xem', () => {
    setup();
    expect(screen.queryByText(/Đang xem lịch/)).not.toBeInTheDocument();
    document.body.innerHTML = '';
    setup('2026-11-18', TODAY, { showViewing: true });
    expect(
      screen.getByText('Đang xem lịch Ngày mai 18/11'),
    ).toBeInTheDocument();
    document.body.innerHTML = '';
    setup(TODAY, TODAY, { showViewing: true });
    expect(screen.getByText('Đang xem lịch Hôm nay 17/11')).toBeInTheDocument();
  });

  // Hợp đồng lớp, vitest `css:false` không thấy bố cục thật; ca này khoá BÀI HỌC của Chromium 375 px (TRACKING search 10.9): khung cuộn ngang cắt viền focus
  // nằm ngoài thẻ, nên khung phải có đệm `p-1` trong và lề âm `-m-1` bù; từ 640 px lưới 7 cột, không cuộn, không đệm. Số đo thật vẫn là Chromium.
  it('SLT-45 khung dải: < 640 px cuộn ngang có đệm p-1 và lề âm -m-1 (viền focus không bị cắt); từ 640 px lưới 7 cột, bỏ đệm và lề', () => {
    const { group } = setup();
    expect(group).toHaveClass('flex', 'overflow-x-auto', '-m-1', 'p-1');
    expect(group).toHaveClass(
      'sm:grid',
      'sm:grid-cols-7',
      'sm:overflow-visible',
      'sm:m-0',
      'sm:p-0',
    );
  });
});
