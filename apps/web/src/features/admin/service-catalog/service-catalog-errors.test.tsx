import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { AdminMeProvider } from '../admin-me-context';
import { ServiceCatalogPage } from './service-catalog-page';
import type {
  ServiceCatalogItem,
  ServiceGroupListItem,
} from './service-catalog-types';

// AF3-10 và AF3-04/05 ở mức cả trang (admin PR2 mục 6.2, 6.3): lỗi máy chủ chỉ hiện MỘT chỗ qua đường thật (tab → form → API client),
// giá gửi lên API là chuỗi chữ số thuần, và các ca không được im lặng.

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const groups: ServiceGroupListItem[] = [
  { nhomDichVuId: '1', ten: 'Khám tổng quát', thuTuHienThi: 1, soDichVu: 1 },
  { nhomDichVuId: '2', ten: 'Xét nghiệm', thuTuHienThi: 2, soDichVu: 0 },
];

const service: ServiceCatalogItem = {
  dichVuKhamId: '9',
  nhomDichVuId: '1',
  tenNhom: 'Khám tổng quát',
  ten: 'Khám nội tổng quát',
  thoiLuong: 30,
  giaMacDinh: '300000.00',
};

const fetchMock = vi.fn<typeof fetch>();

type Handler = (url: string, method: string) => Response | undefined;

// Định tuyến theo URL và method (thứ tự gọi của hai tab không cố định); `handler` ghi đè trước, còn lại trả danh sách mặc định
function route(handler: Handler) {
  fetchMock.mockImplementation((input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const custom = handler(url, method);
    if (custom) return Promise.resolve(custom);
    if (url.includes('/admin/service-groups'))
      return Promise.resolve(
        response({ items: groups, total: 2, page: 1, pageSize: 20 }),
      );
    if (url.includes('/admin/services'))
      return Promise.resolve(
        response({ items: [service], total: 1, page: 1, pageSize: 20 }),
      );
    return Promise.reject(new Error(`Không có route cho ${method} ${url}`));
  });
}

function error(status: number, maLoi: string, loi?: unknown) {
  return response({ maLoi, thongBao: 'x', loi }, status);
}

function renderPage() {
  return render(
    <AdminMeProvider value={{ phamVi: 'ToanHeThong' }}>
      <ServiceCatalogPage />
    </AdminMeProvider>,
  );
}

const alertTexts = () =>
  screen.queryAllByRole('alert').map((element) => element.textContent);
const callsWith = (method: string) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === method);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Nhóm dịch vụ: lỗi một chỗ (AF3-10, AF3-11)', () => {
  it('AF3-10 thêm nhóm trùng tên: đúng MỘT vùng báo (dưới ô tên), form còn mở và giữ nguyên chữ', async () => {
    route((_url, method) =>
      method === 'POST' ? error(409, 'TEN_NHOM_DICH_VU_TRUNG') : undefined,
    );
    renderPage();
    await screen.findByText('Khám tổng quát');
    fireEvent.click(screen.getByRole('button', { name: /Thêm nhóm/ }));
    fireEvent.change(screen.getByLabelText(/Tên nhóm/), {
      target: { value: 'Khám tổng quát' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Lưu nhóm/ }));

    expect(
      await screen.findByText('Tên nhóm dịch vụ đã tồn tại.'),
    ).toBeInTheDocument();
    expect(alertTexts()).toEqual(['Tên nhóm dịch vụ đã tồn tại.']);
    expect(screen.getByLabelText(/Tên nhóm/)).toHaveValue('Khám tổng quát');
    expect(screen.getByLabelText(/Tên nhóm/)).toHaveFocus();
  });

  it('AF3-11 tên trống: lỗi dưới ô, KHÔNG gọi API (không POST)', async () => {
    route(() => undefined);
    renderPage();
    await screen.findByText('Khám tổng quát');
    fireEvent.click(screen.getByRole('button', { name: /Thêm nhóm/ }));

    fireEvent.click(screen.getByRole('button', { name: /Lưu nhóm/ }));

    expect(alertTexts()).toEqual(['Vui lòng nhập tên nhóm.']);
    expect(callsWith('POST')).toHaveLength(0);
  });

  it('AF3-10 xóa nhóm còn dịch vụ: banner là chỗ duy nhất (lỗi không gắn ô)', async () => {
    route((_url, method) =>
      method === 'DELETE' ? error(409, 'NHOM_DICH_VU_CON_DICH_VU') : undefined,
    );
    renderPage();
    await screen.findByText('Khám tổng quát');

    fireEvent.click(screen.getByRole('button', { name: 'Xóa Khám tổng quát' }));
    const dialog = screen.getByRole('dialog', { name: 'Xóa nhóm dịch vụ?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xóa nhóm' }));

    expect(
      await screen.findByText(
        'Không thể xóa nhóm đang có dịch vụ. Hãy chuyển dịch vụ sang nhóm khác trước.',
      ),
    ).toBeInTheDocument();
    expect(alertTexts()).toHaveLength(1);
  });

  it('AF3-10 xóa nhóm gặp lỗi gắn ô (không thể xảy ra, nhưng không được im lặng): hiện câu dự phòng', async () => {
    route((_url, method) =>
      method === 'DELETE'
        ? error(400, 'DU_LIEU_KHONG_HOP_LE', [
            { truong: 'ten', ma: 'TEN_NHOM_DICH_VU_KHONG_HOP_LE' },
          ])
        : undefined,
    );
    renderPage();
    await screen.findByText('Khám tổng quát');

    fireEvent.click(screen.getByRole('button', { name: 'Xóa Khám tổng quát' }));
    const dialog = screen.getByRole('dialog', { name: 'Xóa nhóm dịch vụ?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xóa nhóm' }));

    expect(
      await screen.findByText('Không xóa được nhóm. Vui lòng thử lại.'),
    ).toBeInTheDocument();
    expect(alertTexts()).toHaveLength(1);
  });
});

describe('Dịch vụ khám: lỗi một chỗ, giá nguyên đồng (AF3-04, AF3-05, AF3-12)', () => {
  async function openServicesTab() {
    renderPage();
    await screen.findByText('Khám tổng quát');
    fireEvent.click(screen.getByRole('tab', { name: /Dịch vụ khám/ }));
    await screen.findByText('Khám nội tổng quát');
  }

  it('AF3-04 thêm dịch vụ: giá gõ "150.000" gửi lên API là chuỗi chữ số "150000"', async () => {
    route((_url, method) =>
      method === 'POST'
        ? response({ ...service, dichVuKhamId: '10', ten: 'Siêu âm' }, 201)
        : undefined,
    );
    await openServicesTab();
    fireEvent.click(screen.getByTestId('AF3-add-service'));

    fireEvent.change(screen.getByLabelText(/Tên dịch vụ/), {
      target: { value: 'Siêu âm' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /Nhóm dịch vụ/ }), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText(/Thời lượng/), {
      target: { value: '20' },
    });
    fireEvent.change(screen.getByLabelText(/Giá mặc định/), {
      target: { value: '150.000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Lưu dịch vụ/ }));

    await waitFor(() => expect(callsWith('POST')).toHaveLength(1));
    const [, init] = callsWith('POST')[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      nhomDichVuId: '2',
      ten: 'Siêu âm',
      thoiLuong: 20,
      giaMacDinh: '150000',
    });
    // Chờ form đóng và danh sách tải lại xong, để yêu cầu tải lại không rơi vào sau afterEach (fetch thật ⇒ ECONNREFUSED)
    await waitFor(() =>
      expect(screen.queryByTestId('AF3-service-form')).toBeNull(),
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([input, request]) =>
            String(input).includes('/admin/services') &&
            (request?.method ?? 'GET') === 'GET',
        ).length,
      ).toBeGreaterThanOrEqual(2),
    );
  });

  it('AF3-12 form thêm trống: bốn lỗi dưới ô, không POST', async () => {
    route(() => undefined);
    await openServicesTab();
    fireEvent.click(screen.getByTestId('AF3-add-service'));

    fireEvent.click(screen.getByRole('button', { name: /Lưu dịch vụ/ }));

    expect(alertTexts()).toHaveLength(4);
    expect(callsWith('POST')).toHaveLength(0);
  });

  it('AF3-05 đổi thời lượng dịch vụ đang dùng: lỗi chỉ dưới ô thời lượng (không banner), focus vào ô đó', async () => {
    route((_url, method) =>
      method === 'PATCH' ? error(409, 'THOI_LUONG_DANG_DUNG') : undefined,
    );
    await openServicesTab();
    fireEvent.click(
      screen.getByRole('button', { name: 'Sửa Khám nội tổng quát' }),
    );
    const form = screen.getByRole('form', { name: 'Chỉnh sửa dịch vụ khám' });
    fireEvent.change(within(form).getByLabelText(/Thời lượng/), {
      target: { value: '45' },
    });

    fireEvent.click(within(form).getByRole('button', { name: /Lưu dịch vụ/ }));

    const text =
      'Không thể đổi thời lượng vì dịch vụ đang được lịch hẹn hoặc khung giờ sử dụng.';
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(alertTexts()).toEqual([text]);
    expect(within(form).getByLabelText(/Thời lượng/)).toHaveFocus();
    // Giá "300000.00" của API được nạp đã định dạng và gửi lại là số nguyên
    const [, init] = callsWith('PATCH')[0] ?? [];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      thoiLuong: 45,
      giaMacDinh: '300000',
    });
  });

  it('AF3-10 tên dịch vụ trùng khi sửa: một vùng báo dưới ô tên', async () => {
    route((_url, method) =>
      method === 'PATCH' ? error(409, 'TEN_DICH_VU_TRUNG') : undefined,
    );
    await openServicesTab();
    fireEvent.click(
      screen.getByRole('button', { name: 'Sửa Khám nội tổng quát' }),
    );
    const form = screen.getByRole('form', { name: 'Chỉnh sửa dịch vụ khám' });

    fireEvent.click(within(form).getByRole('button', { name: /Lưu dịch vụ/ }));

    expect(
      await screen.findByText('Tên dịch vụ đã tồn tại trong nhóm này.'),
    ).toBeInTheDocument();
    expect(alertTexts()).toEqual(['Tên dịch vụ đã tồn tại trong nhóm này.']);
  });

  // PR3-W04: API (PR3) từ chối giá có phần lẻ. Nếu vẫn trả GIA_MAC_DINH_KHONG_HOP_LE cho giá mà web đã gửi đúng chuỗi chữ số thì lỗi phải
  // hiện MỘT chỗ dưới ô giá (không banner) ở cả đường tạo lẫn đường sửa, và giá người dùng đã nhập không bị mất.
  const PRICE_TEXT = 'Giá phải là số nguyên đồng lớn hơn 0.';
  const priceRejected = () =>
    error(400, 'DU_LIEU_KHONG_HOP_LE', [
      { truong: 'giaMacDinh', ma: 'GIA_MAC_DINH_KHONG_HOP_LE' },
    ]);

  it('PR3-W04 tạo dịch vụ: API trả lỗi giá ⇒ một vùng báo dưới ô giá, ô giá aria-invalid, không banner, giá còn nguyên', async () => {
    route((_url, method) => (method === 'POST' ? priceRejected() : undefined));
    await openServicesTab();
    fireEvent.click(screen.getByTestId('AF3-add-service'));
    fireEvent.change(screen.getByLabelText(/Tên dịch vụ/), {
      target: { value: 'Siêu âm' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /Nhóm dịch vụ/ }), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText(/Thời lượng/), {
      target: { value: '20' },
    });
    fireEvent.change(screen.getByLabelText(/Giá mặc định/), {
      target: { value: '150.000' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Lưu dịch vụ/ }));

    expect(await screen.findByText(PRICE_TEXT)).toBeInTheDocument();
    expect(alertTexts()).toEqual([PRICE_TEXT]);
    const price = screen.getByLabelText(/Giá mặc định/);
    expect(price).toHaveAttribute('aria-invalid', 'true');
    expect(price).toHaveAccessibleDescription(
      expect.stringContaining(PRICE_TEXT),
    );
    expect(price).toHaveValue('150.000');
    const [, init] = callsWith('POST')[0] ?? [];
    expect(JSON.parse(String(init?.body)).giaMacDinh).toBe('150000');
  });

  it('PR3-W04 sửa dịch vụ: API trả lỗi giá ⇒ một vùng báo dưới ô giá, ô giá aria-invalid, không banner, giá còn nguyên', async () => {
    route((_url, method) => (method === 'PATCH' ? priceRejected() : undefined));
    await openServicesTab();
    fireEvent.click(
      screen.getByRole('button', { name: 'Sửa Khám nội tổng quát' }),
    );
    const form = screen.getByRole('form', { name: 'Chỉnh sửa dịch vụ khám' });
    fireEvent.change(within(form).getByLabelText(/Giá mặc định/), {
      target: { value: '350.000' },
    });

    fireEvent.click(within(form).getByRole('button', { name: /Lưu dịch vụ/ }));

    expect(await screen.findByText(PRICE_TEXT)).toBeInTheDocument();
    expect(alertTexts()).toEqual([PRICE_TEXT]);
    const price = within(form).getByLabelText(/Giá mặc định/);
    expect(price).toHaveAttribute('aria-invalid', 'true');
    expect(price).toHaveAccessibleDescription(
      expect.stringContaining(PRICE_TEXT),
    );
    expect(price).toHaveValue('350.000');
    const [, init] = callsWith('PATCH')[0] ?? [];
    expect(JSON.parse(String(init?.body)).giaMacDinh).toBe('350000');
  });

  it('AF3-10 mất kết nối khi lưu: banner là chỗ duy nhất', async () => {
    route((_url, method) => {
      if (method === 'PATCH') throw new TypeError('Failed to fetch');
      return undefined;
    });
    await openServicesTab();
    fireEvent.click(
      screen.getByRole('button', { name: 'Sửa Khám nội tổng quát' }),
    );
    const form = screen.getByRole('form', { name: 'Chỉnh sửa dịch vụ khám' });

    fireEvent.click(within(form).getByRole('button', { name: /Lưu dịch vụ/ }));

    expect(
      await screen.findByText(
        'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.',
      ),
    ).toBeInTheDocument();
    expect(alertTexts()).toHaveLength(1);
  });
});
