import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AdminMe } from '../admin-me';
import { AdminMeProvider } from '../admin-me-context';
import { ServiceCatalogPage } from './service-catalog-page';
import type { ServiceGroup } from './service-catalog-types';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const groups: ServiceGroup[] = [
  { nhomDichVuId: '1', ten: 'Khám tổng quát', thuTuHienThi: 1 },
  { nhomDichVuId: '2', ten: 'Xét nghiệm', thuTuHienThi: 2 },
];

function page(items: ServiceGroup[]) {
  return { items, total: items.length, page: 1, pageSize: 20 };
}

function renderPage(scope: AdminMe = { phamVi: 'ToanHeThong' }) {
  return render(
    <AdminMeProvider value={scope}>
      <ServiceCatalogPage />
    </AdminMeProvider>,
  );
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ServiceCatalogPage (F3)', () => {
  it('AF3-01 hiển thị hai tab và danh sách nhóm; số dịch vụ để trống khi API chưa trả', async () => {
    fetchMock.mockResolvedValueOnce(response(page(groups)));
    renderPage();

    expect(await screen.findByText('Khám tổng quát')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Nhóm dịch vụ/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /Dịch vụ khám/ })).toBeVisible();
    // B2 chưa trả số dịch vụ theo nhóm: ô hiện "—", không bịa số
    expect(screen.getAllByText('—')).toHaveLength(groups.length);
    expect(
      screen.getByRole('button', { name: /Thêm nhóm/ }),
    ).toBeInTheDocument();
  });

  it('AF3-03 thêm nhóm gửi đúng POST B2 và tải lại danh sách', async () => {
    fetchMock
      .mockResolvedValueOnce(response(page(groups)))
      .mockResolvedValueOnce(
        response({ nhomDichVuId: '3', ten: 'Tầm soát', thuTuHienThi: 3 }, 201),
      )
      .mockResolvedValueOnce(
        response(
          page([
            ...groups,
            { nhomDichVuId: '3', ten: 'Tầm soát', thuTuHienThi: 3 },
          ]),
        ),
      );
    renderPage();
    await screen.findByText('Khám tổng quát');

    fireEvent.click(screen.getByRole('button', { name: /Thêm nhóm/ }));
    // Figma 561:2: thanh công cụ ẩn khi form thêm đang mở
    expect(screen.queryByRole('searchbox')).toBeNull();
    fireEvent.change(screen.getByLabelText(/Tên nhóm/), {
      target: { value: 'Tầm soát' },
    });
    fireEvent.change(screen.getByLabelText(/Thứ tự hiển thị/), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Lưu nhóm/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(String(url)).toContain('/admin/service-groups');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      ten: 'Tầm soát',
      thuTuHienThi: 3,
    });
    expect(await screen.findByText('Tầm soát')).toBeInTheDocument();
  });

  it('AF3-04 Admin Chi nhánh chỉ xem: không có nút thêm/sửa/xóa, có banner và dòng phụ riêng', async () => {
    fetchMock.mockResolvedValueOnce(response(page(groups)));
    renderPage({
      phamVi: 'ChiNhanh',
      chiNhanh: { id: '1', ten: 'Chi nhánh Quận 3' },
    });

    expect(await screen.findByText('Khám tổng quát')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Thêm nhóm/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Sửa / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Xóa / })).toBeNull();
    expect(
      screen.getByText(/Chỉ Admin Toàn hệ thống có thể thêm hoặc sửa nhóm/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Xem danh mục hệ thống\. Để chọn dịch vụ cho chi nhánh/),
    ).toBeInTheDocument();
  });

  it('AF3-05 chuyển sang tab Dịch vụ khám và tải danh sách B3 với giá dạng "300.000đ"', async () => {
    fetchMock
      .mockResolvedValueOnce(response(page(groups)))
      .mockResolvedValueOnce(
        response({
          items: [
            {
              dichVuKhamId: '9',
              nhomDichVuId: '1',
              tenNhom: 'Khám tổng quát',
              ten: 'Khám nội tổng quát',
              thoiLuong: 30,
              giaMacDinh: '300000.00',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
      )
      .mockResolvedValue(response(page(groups)));
    renderPage();
    await screen.findByText('Khám tổng quát');

    fireEvent.click(screen.getByRole('tab', { name: /Dịch vụ khám/ }));

    expect(await screen.findByText('Khám nội tổng quát')).toBeInTheDocument();
    expect(screen.getByText('300.000đ')).toBeInTheDocument();
    expect(screen.getByText('30 phút')).toBeInTheDocument();
  });
});
