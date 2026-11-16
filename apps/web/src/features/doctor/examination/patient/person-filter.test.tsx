import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ExamineeOption } from '../api/patient-exam-types';
import { PersonFilter } from './person-filter';

// doctor-exam F5, WXH-03: chip lọc người khám (Figma `414:168`). Chip theo THỨ TỰ API (bản thân đứng đầu); hồ sơ người thân đã ngừng dùng vẫn là chip (Q18: API đã đưa vào, web không lọc). Khoá TÊN LỚP từng lớp (AI-BUG-052).
const PEOPLE: ExamineeOption[] = [
  { id: null, hoTen: 'Nguyễn Văn A', quanHe: null },
  { id: '501', hoTen: 'Bùi Minh Khoa', quanHe: 'Con' },
  // Hồ sơ đã ngừng dùng: API không có cờ nào phân biệt, nên chip giống mọi chip khác
  { id: '777', hoTen: 'Trần Văn Cũ', quanHe: 'OngBa' },
];

function renderFilter(selected: string | null = null) {
  const onSelect = vi.fn();
  render(
    <PersonFilter people={PEOPLE} selected={selected} onSelect={onSelect} />,
  );
  return onSelect;
}
const group = () => screen.getByRole('group', { name: 'Lọc theo người khám' });
const chip = (name: string) => within(group()).getByRole('button', { name });

describe('doctor-exam F5 — chip lọc người khám', () => {
  it('WXH-03 "Tất cả người đi khám" rồi từng lựa chọn đúng thứ tự API: "Họ tên (Bản thân)" và "Họ tên · Quan hệ"', () => {
    renderFilter();
    expect(
      within(group())
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      'Tất cả người đi khám',
      'Nguyễn Văn A (Bản thân)',
      'Bùi Minh Khoa · Con',
      'Trần Văn Cũ · Ông/Bà',
    ]);
  });

  it('WXH-03 chọn chip ⇒ giá trị gửi: `null` (tất cả), `BanThan`, id hồ sơ người thân', () => {
    const onSelect = renderFilter();
    fireEvent.click(chip('Tất cả người đi khám'));
    expect(onSelect).toHaveBeenLastCalledWith(null);
    fireEvent.click(chip('Nguyễn Văn A (Bản thân)'));
    expect(onSelect).toHaveBeenLastCalledWith('BanThan');
    fireEvent.click(chip('Bùi Minh Khoa · Con'));
    expect(onSelect).toHaveBeenLastCalledWith('501');
    fireEvent.click(chip('Trần Văn Cũ · Ông/Bà'));
    expect(onSelect).toHaveBeenLastCalledWith('777');
    expect(onSelect).toHaveBeenCalledTimes(4);
  });

  it.each([
    [null, 'Tất cả người đi khám'],
    ['BanThan', 'Nguyễn Văn A (Bản thân)'],
    ['501', 'Bùi Minh Khoa · Con'],
    ['777', 'Trần Văn Cũ · Ông/Bà'],
  ])(
    'WXH-03 đang chọn %j ⇒ ĐÚNG MỘT chip `aria-pressed` là "%s"',
    (selected, name) => {
      renderFilter(selected);
      const pressed = within(group())
        .getAllByRole('button')
        .filter((button) => button.getAttribute('aria-pressed') === 'true');
      expect(pressed).toHaveLength(1);
      expect(pressed[0]).toHaveAccessibleName(name);
    },
  );

  it('WXH-17 chip đang chọn: nền `brand-strong` chữ trắng (không `bg-brand`, không nền trắng); chip khác: nền trắng, viền `gray-300`, chữ `gray-600`', () => {
    renderFilter('501');
    const on = chip('Bùi Minh Khoa · Con');
    expect(on).toHaveClass('bg-brand-strong');
    expect(on).toHaveClass('border-brand-strong');
    expect(on).toHaveClass('text-white');
    expect(on).not.toHaveClass('bg-brand');
    expect(on).not.toHaveClass('bg-white');
    const off = chip('Tất cả người đi khám');
    expect(off).toHaveClass('bg-white');
    expect(off).toHaveClass('border-gray-300');
    expect(off).toHaveClass('text-gray-600');
    expect(off).not.toHaveClass('bg-brand-strong');
    expect(off).not.toHaveClass('text-white');
  });

  it('WXH-17 chip bo tròn, chữ 11,25 px (`text-xs`), biểu tượng trang trí `aria-hidden`', () => {
    renderFilter();
    const on = chip('Tất cả người đi khám');
    expect(on).toHaveClass('rounded-full');
    expect(on).toHaveClass('text-xs');
    expect(on).toHaveClass('font-medium');
    expect(on.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('WXH-03 tên hiển thị là chữ thuần: tên có `<b>` không thành phần tử', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <PersonFilter
        people={[{ id: '9', hoTen: '<b>Đậm</b>', quanHe: 'Khac' }]}
        selected={null}
        onSelect={onSelect}
      />,
    );
    expect(container.querySelector('b')).toBeNull();
    expect(
      screen.getByRole('button', { name: '<b>Đậm</b> · Khác' }),
    ).toBeInTheDocument();
  });
});
