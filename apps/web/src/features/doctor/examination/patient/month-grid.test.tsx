import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MonthGrid } from './month-grid';
import { YearTabs } from './year-tabs';

// doctor-exam F5: lưới 12 tháng và hàng tab năm (Figma `414:192`, `414:193`). WXH-02 (số ca lấy từ `demTheoThang`, ô 0 ca vô hiệu), WXH-17 [đề xuất] (tên truy cập, `aria-pressed`, khoá TÊN LỚP; kích thước thật đo ở Chromium).
// MỖI lớp một khẳng định `toHaveClass` hay `.not.toHaveClass` (jest-dom: `.not` với nhiều lớp chỉ đỏ khi có ĐỦ mọi lớp, AI-BUG-052).
const COUNTS = [0, 0, 0, 0, 1, 5, 0, 0, 0, 2, 0, 0];

function renderGrid(selected: number | null = 10) {
  const onSelect = vi.fn();
  render(<MonthGrid counts={COUNTS} selected={selected} onSelect={onSelect} />);
  return onSelect;
}
const group = () => screen.getByRole('group', { name: 'Chọn tháng' });
const month = (name: string) => within(group()).getByRole('button', { name });

describe('doctor-exam F5 — lưới 12 tháng', () => {
  it('WXH-02 mười hai ô theo thứ tự tháng, mỗi ô "Tháng N" và số ca của máy chủ hoặc dấu gạch (Figma 414:197)', () => {
    renderGrid();
    const cells = within(group()).getAllByRole('button');
    expect(cells).toHaveLength(12);
    expect(cells.map((cell) => cell.textContent)).toEqual([
      'Tháng 1–',
      'Tháng 2–',
      'Tháng 3–',
      'Tháng 4–',
      'Tháng 51',
      'Tháng 65',
      'Tháng 7–',
      'Tháng 8–',
      'Tháng 9–',
      'Tháng 102',
      'Tháng 11–',
      'Tháng 12–',
    ]);
  });

  it('WXH-17 tên truy cập "Tháng 5, 1 ca" và "Tháng 1, không có ca"', () => {
    renderGrid();
    expect(month('Tháng 5, 1 ca')).toBeInTheDocument();
    expect(month('Tháng 6, 5 ca')).toBeInTheDocument();
    expect(month('Tháng 10, 2 ca')).toBeInTheDocument();
    expect(month('Tháng 1, không có ca')).toBeInTheDocument();
    expect(month('Tháng 12, không có ca')).toBeInTheDocument();
  });

  it('WXH-02 ô 0 ca là `disabled` và bấm KHÔNG gọi onSelect; ô có ca bấm được và gọi đúng tháng', () => {
    const onSelect = renderGrid();
    for (const name of ['Tháng 1, không có ca', 'Tháng 7, không có ca']) {
      expect(month(name)).toBeDisabled();
      fireEvent.click(month(name));
    }
    expect(onSelect).not.toHaveBeenCalled();

    for (const [name, value] of [
      ['Tháng 5, 1 ca', 5],
      ['Tháng 6, 5 ca', 6],
      ['Tháng 10, 2 ca', 10],
    ] as const) {
      expect(month(name)).toBeEnabled();
      fireEvent.click(month(name));
      expect(onSelect).toHaveBeenLastCalledWith(value);
    }
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it('WXH-17 `aria-pressed` đúng một ô (tháng đang chọn); chưa chọn thì không ô nào', () => {
    renderGrid(6);
    const pressed = within(group())
      .getAllByRole('button')
      .filter((cell) => cell.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveAccessibleName('Tháng 6, 5 ca');
  });

  it('WXH-17 chưa chọn tháng nào (null) ⇒ không ô `aria-pressed="true"`', () => {
    renderGrid(null);
    expect(
      within(group())
        .getAllByRole('button')
        .filter((cell) => cell.getAttribute('aria-pressed') === 'true'),
    ).toHaveLength(0);
  });

  it('WXH-17 ô đang chọn: nền `brand-strong` chữ trắng, số `cyan-100` (Figma 0092b8 chỉ 3,62:1: ADR 0004); không nền `bg-brand` và không nền trắng', () => {
    renderGrid(10);
    const selected = month('Tháng 10, 2 ca');
    expect(selected).toHaveClass('bg-brand-strong');
    expect(selected).toHaveClass('text-white');
    expect(selected).not.toHaveClass('bg-brand');
    expect(selected).not.toHaveClass('bg-white');
    expect(selected.lastElementChild).toHaveClass('text-cyan-100');
    expect(selected.lastElementChild).not.toHaveClass('text-brand-strong');
  });

  it('WXH-17 ô có ca chưa chọn: nền trắng, chữ `gray-700`, số `brand-strong`', () => {
    renderGrid(10);
    const cell = month('Tháng 6, 5 ca');
    expect(cell).toHaveClass('bg-white');
    expect(cell).toHaveClass('text-gray-700');
    expect(cell).not.toHaveClass('bg-brand-strong');
    expect(cell).not.toHaveClass('text-white');
    expect(cell.lastElementChild).toHaveClass('text-brand-strong');
    expect(cell.lastElementChild).not.toHaveClass('text-cyan-100');
  });

  it('WXH-17 ô không ca: chữ nhạt (vô hiệu, miễn tương phản), số dạng dấu gạch nhạt', () => {
    renderGrid(10);
    const cell = month('Tháng 1, không có ca');
    expect(cell).toHaveClass('text-gray-300');
    expect(cell).not.toHaveClass('text-gray-700');
    expect(cell.lastElementChild).toHaveClass('text-gray-200');
  });

  it('WXH-17 khung lưới: 6 cột ở màn hẹp, 12 cột từ `md`, khe 1 px nền `gray-100`', () => {
    renderGrid();
    expect(group()).toHaveClass('grid');
    expect(group()).toHaveClass('grid-cols-6');
    expect(group()).toHaveClass('md:grid-cols-12');
    expect(group()).toHaveClass('gap-px');
    expect(group()).toHaveClass('bg-gray-100');
  });
});

describe('doctor-exam F5 — hàng tab năm', () => {
  const YEARS = [2026, 2025, 2024, 2023, 2022];

  function renderTabs(selected = 2026) {
    const onSelect = vi.fn();
    render(<YearTabs years={YEARS} selected={selected} onSelect={onSelect} />);
    return onSelect;
  }
  const tabs = () => screen.getByRole('group', { name: 'Năm' });

  it('WXH-02 năm hiện tại và bốn năm trước theo thứ tự đưa vào; chọn năm gọi onSelect đúng năm', () => {
    const onSelect = renderTabs();
    const buttons = within(tabs()).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      '2026',
      '2025',
      '2024',
      '2023',
      '2022',
    ]);
    fireEvent.click(within(tabs()).getByRole('button', { name: '2024' }));
    expect(onSelect).toHaveBeenCalledWith(2024);
  });

  it('WXH-17 `aria-pressed` đúng một tab và tab đó có nền `brand-soft`, chữ `brand-strong`, gạch chân `brand-strong`', () => {
    renderTabs(2025);
    const pressed = within(tabs())
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveTextContent('2025');
    expect(pressed[0]).toHaveClass('bg-brand-soft');
    expect(pressed[0]).toHaveClass('text-brand-strong');
    expect(pressed[0]).toHaveClass('border-brand-strong');
    expect(pressed[0]).not.toHaveClass('border-transparent');
    const other = within(tabs()).getByRole('button', { name: '2026' });
    expect(other).toHaveClass('border-transparent');
    expect(other).not.toHaveClass('bg-brand-soft');
    expect(other).not.toHaveClass('border-brand-strong');
  });
});
