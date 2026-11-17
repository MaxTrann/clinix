import { render, screen } from '@testing-library/react';
import { ServiceForm } from './service-form';

// AF1-12/AF3-13 (tách khỏi `service-catalog-focus.test.tsx` cũ khi viền focus về lớp base, TRACKING admin mục 7): ô giá có hậu tố "đ"
// chừa chỗ bên phải bằng MỘT lớp padding. Viền focus của ô nhập không khoá ở đây nữa mà ở `src/styles/focus-ring.test.ts` (FG-01 đến FG-04)
// và `focus-hygiene.test.ts` (FG-05, FG-06). Kích thước và điểm ảnh thật chỉ Chromium thấy.

describe('AF1-12/AF3-13 ô giá của form dịch vụ khám', () => {
  it('ô giá có hậu tố "đ": chừa chỗ bên phải bằng MỘT lớp padding (không chồng px và pr), hậu tố không chặn chuột', () => {
    render(
      <ServiceForm
        groups={[{ nhomDichVuId: '1', ten: 'Khám tổng quát', thuTuHienThi: 1 }]}
        pending={false}
        feedback={null}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const price = screen.getByLabelText(/Giá mặc định/);
    expect(price).toHaveClass('pr-9');
    expect(price).toHaveClass('pl-[11.25px]');
    // `px-*` và `pr-*` cùng đặt padding phải; thứ tự trong CSS build quyết định ai thắng nên chỉ dùng MỘT trong hai
    expect(price).not.toHaveClass('px-[11.25px]');
    expect(screen.getByText('đ')).toHaveClass('pointer-events-none');
    expect(screen.getByText('đ')).toHaveClass('absolute');
  });
});
