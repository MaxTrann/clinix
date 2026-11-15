import { fireEvent, render, screen } from '@testing-library/react';
import { SearchField } from './search-field';

// search F14, nhóm G5 (K4): ô tìm theo Figma 217:67 (UIS-09). Mức W (`css: false`): khoá LỚP CSS và việc chuyển thuộc tính.
// Gốc `html` 15 px: `h-12` = 45 px, `size-5` = 18,75 px, `left-3.5` = `top-3.5` = 13,125 px, `text-base` = 15 px.
describe('SearchField theo Figma 217:67 (UIS-09)', () => {
  it('UIS-09 ô cao 45 px, bo 13,375 px, chữ 15 px, đệm trái 41,25 px chừa chỗ cho kính lúp', () => {
    render(<SearchField aria-label="Tìm" placeholder="Tìm chuyên khoa" />);
    const input = screen.getByRole('searchbox', { name: 'Tìm' });
    expect(input).toHaveClass(
      'h-12',
      'w-full',
      'rounded-[13.375px]',
      'pl-[41.25px]',
      'pr-[15px]',
      'text-base',
      'border-gray-200',
    );
    expect(input).not.toHaveClass('py-2');
    expect(input).not.toHaveClass('text-sm');
    expect(input).not.toHaveClass('rounded-[0.625rem]');
  });

  it('UIS-09 kính lúp 18,75 px cách mép trái và mép trên 13,125 px, không nhận chuột và ẩn với trình đọc màn hình', () => {
    const { container } = render(<SearchField aria-label="Tìm" />);
    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon).toHaveClass(
      'size-5',
      'left-3.5',
      'top-3.5',
      'absolute',
      'pointer-events-none',
    );
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('UIS-09 chuyển id, giá trị, placeholder, maxLength và sự kiện gõ cho ô nhập; luôn là type="search"', () => {
    const onChange = vi.fn();
    render(
      <SearchField
        id="o-tim"
        value="tim"
        maxLength={100}
        placeholder="Gõ để tìm"
        onChange={onChange}
      />,
    );
    const input = screen.getByPlaceholderText('Gõ để tìm');
    expect(input).toHaveAttribute('id', 'o-tim');
    expect(input).toHaveAttribute('type', 'search');
    expect(input).toHaveAttribute('maxlength', '100');
    expect(input).toHaveValue('tim');
    fireEvent.change(input, { target: { value: 'tim mạch' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('UIS-09 lớp thêm của nơi dùng được nối vào, không làm mất lớp kích thước', () => {
    render(<SearchField aria-label="Tìm" className="bg-gray-50" />);
    const input = screen.getByRole('searchbox');
    expect(input).toHaveClass('bg-gray-50', 'h-12', 'rounded-[13.375px]');
  });
});
