import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { AdminMe } from '../admin-me';
import { AdminMeProvider } from '../admin-me-context';
import { ServiceCatalogPage } from './service-catalog-page';
import type { ServiceGroupListItem } from './service-catalog-types';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const groups: ServiceGroupListItem[] = [
  { nhomDichVuId: '1', ten: 'Khám tổng quát', thuTuHienThi: 1, soDichVu: 3 },
  { nhomDichVuId: '2', ten: 'Xét nghiệm', thuTuHienThi: 2, soDichVu: 0 },
];

function page(items: ServiceGroupListItem[]) {
  return { items, total: items.length, page: 1, pageSize: 20 };
}

function renderPage(scope: AdminMe = { phamVi: 'ToanHeThong' }) {
  return render(
    <AdminMeProvider value={scope}>
      <ServiceCatalogPage />
    </AdminMeProvider>,
  );
}

// Chữ của cột "Số dịch vụ" (ô thứ hai) ở từng dòng dữ liệu của bảng nhóm
function serviceCounts(): (string | null)[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[1]?.textContent ?? null);
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
  it('AF3-01 hiển thị hai tab và danh sách nhóm kèm số dịch vụ thật của từng nhóm', async () => {
    fetchMock.mockResolvedValueOnce(response(page(groups)));
    renderPage();

    expect(await screen.findByText('Khám tổng quát')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Nhóm dịch vụ/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /Dịch vụ khám/ })).toBeVisible();
    // PR3: API trả `soDichVu`, ô hiện số thật (không còn "—")
    expect(serviceCounts()).toEqual(['3', '0']);
    expect(screen.queryByText('—')).toBeNull();
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
            {
              nhomDichVuId: '3',
              ten: 'Tầm soát',
              thuTuHienThi: 3,
              soDichVu: 0,
            },
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

  it('AF1-11 hai tab dùng chung chân phân trang "Hiển thị a–b trên c"', async () => {
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
          total: 21,
          page: 1,
          pageSize: 20,
        }),
      )
      .mockResolvedValue(response(page(groups)));
    renderPage();

    expect(await screen.findByText('Hiển thị 1–2 trên 2')).toBeInTheDocument();
    expect(screen.queryByText('1–2 / 2')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /Dịch vụ khám/ }));

    expect(
      await screen.findByText('Hiển thị 1–20 trên 21'),
    ).toBeInTheDocument();
    expect(screen.getByText('Trang 1 / 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeEnabled();
  });
});

describe('ServiceCatalogPage cột Thao tác dùng icon (AF3-09)', () => {
  const service = {
    dichVuKhamId: '9',
    nhomDichVuId: '1',
    tenNhom: 'Khám tổng quát',
    ten: 'Khám nội tổng quát',
    thoiLuong: 30,
    giaMacDinh: '300000.00',
  };

  it('tab Nhóm dịch vụ: Sửa và Xóa là nút icon, giữ aria-label và title, không còn chữ hiển thị', async () => {
    fetchMock.mockResolvedValueOnce(response(page(groups)));
    renderPage();
    await screen.findByText('Khám tổng quát');

    const edit = screen.getByRole('button', { name: 'Sửa Khám tổng quát' });
    const remove = screen.getByRole('button', { name: 'Xóa Khám tổng quát' });

    expect(edit).toHaveAttribute('title', 'Sửa');
    expect(remove).toHaveAttribute('title', 'Xóa');
    expect(edit.querySelector('svg')).toHaveClass('lucide-pencil');
    expect(remove.querySelector('svg')).toHaveClass('lucide-trash-2');
    expect(edit.textContent).toBe('');
    expect(remove.textContent).toBe('');
  });

  it('tab Nhóm dịch vụ: icon thùng rác vẫn mở hộp xác nhận xóa, icon bút chì vẫn mở form sửa', async () => {
    fetchMock.mockResolvedValueOnce(response(page(groups)));
    renderPage();
    await screen.findByText('Khám tổng quát');

    fireEvent.click(screen.getByRole('button', { name: 'Xóa Khám tổng quát' }));
    expect(
      screen.getByRole('dialog', { name: 'Xóa nhóm dịch vụ?' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));

    fireEvent.click(screen.getByRole('button', { name: 'Sửa Khám tổng quát' }));
    expect(
      screen.getByRole('form', { name: 'Chỉnh sửa nhóm dịch vụ' }),
    ).toBeInTheDocument();
  });

  it('tab Dịch vụ khám: Sửa là nút icon, giữ aria-label và title, vẫn mở form sửa', async () => {
    fetchMock
      .mockResolvedValueOnce(response(page(groups)))
      .mockResolvedValueOnce(
        response({ items: [service], total: 1, page: 1, pageSize: 20 }),
      )
      .mockResolvedValue(response(page(groups)));
    renderPage();
    await screen.findByText('Khám tổng quát');
    fireEvent.click(screen.getByRole('tab', { name: /Dịch vụ khám/ }));
    await screen.findByText('Khám nội tổng quát');

    const edit = screen.getByRole('button', { name: 'Sửa Khám nội tổng quát' });

    expect(edit).toHaveAttribute('title', 'Sửa');
    expect(edit.querySelector('svg')).toHaveClass('lucide-pencil');
    expect(edit.textContent).toBe('');
    fireEvent.click(edit);
    expect(
      screen.getByRole('form', { name: 'Chỉnh sửa dịch vụ khám' }),
    ).toBeInTheDocument();
  });
});
