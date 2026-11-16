import { render, screen } from '@testing-library/react';
import { ServiceForm } from './service-form';
import { ServiceGroupForm } from './service-group-form';
import { ServiceGroupsTab } from './service-groups-tab';
import { ServicesTab } from './services-tab';

// AF1-12 (PR1 mục 1) phần Tailwind: ô nhập của nhóm dịch vụ và dịch vụ khám khi focus đổi viền sang teal kèm bóng TRONG 1px
// (mép ngoài không nhích ra), không còn vòng `ring` ngoài. Mỗi lớp cấm một `not.toHaveClass` riêng (AI-BUG-052: gộp nhiều lớp
// vào một lệnh chỉ kiểm lớp đầu). Kích thước, điểm ảnh và màu thật chỉ Chromium thấy.

const REQUIRED = [
  'focus:border-brand',
  'focus:shadow-[inset_0_0_0_1px_var(--color-brand)]',
];
const FORBIDDEN = [
  'focus:ring-1',
  'focus:ring-2',
  'focus:ring-brand',
  'focus:ring-brand/15',
];

function expectInsetFocus(element: HTMLElement) {
  for (const name of REQUIRED) expect(element).toHaveClass(name);
  for (const name of FORBIDDEN) expect(element).not.toHaveClass(name);
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve(response({ items: [], total: 0, page: 1, pageSize: 20 })),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AF1-12 viền focus Tailwind của trang Loại dịch vụ khám', () => {
  it('form nhóm dịch vụ: ô tên và ô thứ tự dùng bóng trong', () => {
    render(
      <ServiceGroupForm
        pending={false}
        feedback={null}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expectInsetFocus(screen.getByLabelText(/Tên nhóm/));
    expectInsetFocus(screen.getByLabelText(/Thứ tự hiển thị/));
  });

  it('form dịch vụ khám: ô tên, nhóm, thời lượng và giá dùng bóng trong', () => {
    render(
      <ServiceForm
        groups={[{ nhomDichVuId: '1', ten: 'Khám tổng quát', thuTuHienThi: 1 }]}
        pending={false}
        feedback={null}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expectInsetFocus(screen.getByLabelText(/Tên dịch vụ/));
    expectInsetFocus(screen.getByRole('combobox', { name: /Nhóm dịch vụ/ }));
    expectInsetFocus(screen.getByLabelText(/Thời lượng/));
    expectInsetFocus(screen.getByLabelText(/Giá mặc định/));
  });

  it('AF1-12/AF3-13 ô giá có hậu tố "đ": chừa chỗ bên phải bằng MỘT lớp padding (không chồng px và pr), hậu tố không chặn chuột', () => {
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

  it('ô tìm của tab Nhóm dịch vụ dùng bóng trong', async () => {
    render(<ServiceGroupsTab canEdit />);

    expectInsetFocus(
      await screen.findByRole('searchbox', { name: 'Tìm nhóm dịch vụ' }),
    );
  });

  it('ô tìm và bộ lọc nhóm của tab Dịch vụ khám dùng bóng trong', async () => {
    render(<ServicesTab canEdit />);

    expectInsetFocus(
      await screen.findByRole('searchbox', { name: 'Tìm dịch vụ khám' }),
    );
    expectInsetFocus(
      screen.getByRole('combobox', { name: 'Lọc theo nhóm dịch vụ' }),
    );
  });
});
