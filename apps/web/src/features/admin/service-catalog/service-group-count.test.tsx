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

// PR3-W02, PR3-W03: cột "Số dịch vụ" của tab Nhóm dịch vụ hiện số thật từ API, và phản hồi sai hình dạng ra hộp lỗi
// (bộ đọc chặt `service-group-reader`), không vẽ dòng dở. Chạy qua đường thật: trang → hook → API client → bộ đọc.
const GENERIC_ERROR = 'Đã có lỗi xảy ra. Vui lòng thử lại sau.';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const row = (id: number, soDichVu: number): ServiceGroupListItem => ({
  nhomDichVuId: String(id),
  ten: `Nhóm ${id}`,
  thuTuHienThi: id,
  soDichVu,
});

const page = (items: unknown[], overrides: Record<string, unknown> = {}) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  ...overrides,
});

// Thiếu `soDichVu`: dạng của API TRƯỚC PR3 (hoặc một proxy trả thân cũ)
const oldShapeRow = { nhomDichVuId: '1', ten: 'Nhóm 1', thuTuHienThi: 1 };

function renderPage(scope: AdminMe = { phamVi: 'ToanHeThong' }) {
  return render(
    <AdminMeProvider value={scope}>
      <ServiceCatalogPage />
    </AdminMeProvider>,
  );
}

// Chữ của cột "Số dịch vụ" (ô thứ hai) ở từng dòng dữ liệu của bảng nhóm
function serviceCountCells(): HTMLElement[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((tableRow) => within(tableRow).getAllByRole('cell')[1]!);
}
const serviceCounts = () => serviceCountCells().map((cell) => cell.textContent);

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Tab Nhóm dịch vụ: cột "Số dịch vụ" (PR3-W02)', () => {
  it('PR3-W02 mỗi dòng hiện số thật; nhóm rỗng hiện "0" chứ không phải "—"; số lớn hiện nguyên', async () => {
    fetchMock.mockResolvedValueOnce(
      response(page([row(1, 0), row(2, 1), row(3, 12), row(4, 9999)])),
    );
    renderPage();
    await screen.findByText('Nhóm 1');

    expect(serviceCounts()).toEqual(['0', '1', '12', '9999']);
    expect(screen.queryByText('—')).toBeNull();
    // Chữ ẩn và gợi ý của thời "API chưa trả số dịch vụ" không còn
    expect(screen.queryByText('Chưa có từ API')).toBeNull();
    expect(document.querySelector('[title*="chưa trả"]')).toBeNull();
  });

  it('PR3-W02 ô số căn giữa như tiêu đề cột và dùng màu chữ của dữ liệu (không còn màu "chỗ trống")', async () => {
    fetchMock.mockResolvedValueOnce(response(page([row(1, 3)])));
    renderPage();
    await screen.findByText('Nhóm 1');

    const header = screen.getByRole('columnheader', { name: 'Số dịch vụ' });
    const [cell] = serviceCountCells();
    expect(header).toHaveClass('text-center');
    expect(cell).toHaveClass('text-center');
    expect(cell).toHaveClass('text-text-secondary');
    expect(cell).not.toHaveClass('text-text-muted');
  });

  it('PR3-W02 Admin Chi nhánh (chỉ xem) cũng thấy số dịch vụ', async () => {
    fetchMock.mockResolvedValueOnce(response(page([row(1, 3), row(2, 0)])));
    renderPage({
      phamVi: 'ChiNhanh',
      chiNhanh: { id: '1', ten: 'Chi nhánh Quận 3' },
    });
    await screen.findByText('Nhóm 1');

    expect(serviceCounts()).toEqual(['3', '0']);
  });

  it('PR3-W02 sang trang 2 thì hiện số của các dòng trang 2', async () => {
    const firstPage = Array.from({ length: 20 }, (_x, index) =>
      row(index + 1, index),
    );
    fetchMock
      .mockResolvedValueOnce(response(page(firstPage, { total: 21 })))
      .mockResolvedValueOnce(
        response(page([row(21, 7)], { total: 21, page: 2 })),
      );
    renderPage();
    await screen.findByText('Nhóm 1');
    expect(serviceCounts()).toHaveLength(20);

    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));

    expect(await screen.findByText('Nhóm 21')).toBeInTheDocument();
    expect(serviceCounts()).toEqual(['7']);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('page=2');
  });
});

describe('Tab Nhóm dịch vụ: phản hồi sai hình dạng (PR3-W03)', () => {
  it('PR3-W03 thiếu soDichVu: hộp lỗi + "Thử lại", KHÔNG hàng bảng, không "—"/"NaN"; thử lại với thân đúng thì bảng hiện', async () => {
    fetchMock
      .mockResolvedValueOnce(response(page([oldShapeRow])))
      .mockResolvedValueOnce(response(page([row(1, 2)])));
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(GENERIC_ERROR);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('Nhóm 1')).toBeNull();
    expect(screen.queryByText('—')).toBeNull();
    expect(screen.queryByText('NaN')).toBeNull();

    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('Nhóm 1')).toBeInTheDocument();
    expect(serviceCounts()).toEqual(['2']);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('PR3-W03 một dòng sai giữa danh sách thì cả danh sách bị từ chối, không dòng nào được vẽ', async () => {
    fetchMock.mockResolvedValueOnce(
      response(page([row(1, 1), { ...row(2, 1), soDichVu: 'hai' }, row(3, 3)])),
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC_ERROR);
    expect(screen.queryByText('Nhóm 1')).toBeNull();
    expect(screen.queryByText('Nhóm 3')).toBeNull();
  });

  it('PR3-W03 hộp chọn nhóm của tab Dịch vụ khám dùng cùng bộ đọc: thân sai hình ra hộp lỗi, thử lại được', async () => {
    let groupBody: unknown = page([row(1, 3)]);
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/admin/service-groups'))
        return Promise.resolve(response(groupBody));
      if (url.includes('/admin/services'))
        return Promise.resolve(response(page([], { total: 0 })));
      return Promise.reject(new Error(`Không có route cho ${url}`));
    });
    renderPage();
    await screen.findByText('Nhóm 1');

    groupBody = page([oldShapeRow]);
    fireEvent.click(screen.getByRole('tab', { name: /Dịch vụ khám/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(GENERIC_ERROR);
    groupBody = page([row(1, 3)]);
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
