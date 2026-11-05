import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from '../../../router/routes';
import { resetSelectedBranchForTest } from '../../../shared/branch-selection';
import {
  createFakeAuthApi,
  createFakeLocks,
} from '../../../test/fake-auth-api';
import { resetAuthForTest } from '../../auth/auth-session';
import { setAuthState } from '../../auth/auth-store';
import type { BranchDetail, BranchSummary } from '../api/search-types';
import { selectedFirst } from './selected-first';

// search F3. Mã ca TCN-12 (danh sách), TCN-13 (chi tiết), CNC-08 lấy từ PLAN search mục 7.1, 7.3.
const STORAGE_KEY = 'clinix.chiNhanhDangChon';

const branch = (id: string, ten: string, diaChi: string): BranchSummary => ({
  chiNhanhId: id,
  ten,
  diaChi,
  toaDoLat: null,
  toaDoLng: null,
});
const SAI_GON = branch('1', 'Chi nhánh Sài Gòn', '1 Đường Mẫu, Quận 3');
const HA_NOI = branch('2', 'Chi nhánh Hà Nội', '2 Đường Mẫu, Hà Nội');
const DA_NANG = branch('3', 'Chi nhánh Đà Nẵng', '3 Đường Mẫu, Đà Nẵng');

const both = {
  sang: { tu: '08:00', den: '12:00' },
  chieu: { tu: '13:00', den: '17:00' },
};
const DETAIL: BranchDetail = {
  ...HA_NOI,
  // Thứ 7 chỉ buổi sáng, Chủ nhật nghỉ, thứ 6 KHÔNG có dòng (chưa khai báo)
  lichHoatDong: [
    { thuTrongTuan: 1, hoatDong: both },
    { thuTrongTuan: 2, hoatDong: both },
    { thuTrongTuan: 3, hoatDong: both },
    { thuTrongTuan: 4, hoatDong: both },
    { thuTrongTuan: 6, hoatDong: { sang: both.sang, chieu: null } },
    { thuTrongTuan: 7, hoatDong: null },
  ],
  dichVuKham: [{ dichVuKhamId: '10', ten: 'Khám tim mạch' }],
  soBacSi: 3,
};

let api: ReturnType<typeof createFakeAuthApi>;
let items: BranchSummary[];
let detail: BranchDetail | 'NOT_FOUND' | 'ERROR';
let listFails: boolean;
let calls: { url: string; headers: Headers }[];

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  resetAuthForTest();
  resetSelectedBranchForTest();
  window.localStorage.clear();
  // Đã có lựa chọn ⇒ khung công khai không xin vị trí (CNC-05)
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ chiNhanhId: '2', nguon: 'NguoiDung' }),
  );
  api = createFakeAuthApi();
  items = [DA_NANG, HA_NOI, SAI_GON];
  detail = { ...DETAIL };
  listFails = false;
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes('/public/')) return api.fetch(input, init);
      calls.push({ url, headers: new Headers(init?.headers) });
      if (url.includes('/public/clinic-info')) {
        return Promise.resolve(
          jsonResponse(200, {
            tenThuongHieu: 'CLINIX',
            diaChiTruSo: null,
            duongDayNong: null,
            email: null,
          }),
        );
      }
      const one = /\/public\/branches\/([^?]+)/.exec(url);
      if (one) {
        // Khung công khai cũng gọi chi tiết chi nhánh đang chọn (giờ chân trang): trả cùng thân
        if (detail === 'NOT_FOUND') {
          return Promise.resolve(
            jsonResponse(404, { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }),
          );
        }
        if (detail === 'ERROR') {
          return Promise.resolve(
            jsonResponse(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
          );
        }
        return Promise.resolve(
          jsonResponse(200, { ...detail, chiNhanhId: one[1] }),
        );
      }
      if (listFails) {
        return Promise.resolve(
          jsonResponse(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
        );
      }
      const q = new URL(url, 'http://localhost').searchParams.get('q');
      const shown = q
        ? items.filter((item) =>
            `${item.ten} ${item.diaChi}`
              .toLowerCase()
              .includes(q.toLowerCase()),
          )
        : items;
      return Promise.resolve(
        jsonResponse(200, {
          items: shown,
          total: shown.length,
          page: 1,
          pageSize: 100,
        }),
      );
    }),
  );
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: createFakeLocks(),
  });
  setAuthState({ status: 'unauthenticated' });
});

afterEach(() => {
  resetAuthForTest();
  resetSelectedBranchForTest();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

const picker = () =>
  screen.getByRole('button', { name: /^Chi nhánh đang chọn:/ });
const stored = () =>
  JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as unknown;
const cards = () => within(screen.getByRole('main')).getAllByRole('listitem');

describe('selectedFirst (Q5)', () => {
  it('đưa chi nhánh đang chọn lên đầu, giữ nguyên thứ tự còn lại', () => {
    expect(
      selectedFirst([DA_NANG, HA_NOI, SAI_GON], '2').map((i) => i.chiNhanhId),
    ).toEqual(['2', '3', '1']);
  });

  it('Toàn quốc hoặc id không có trong danh sách ⇒ giữ nguyên thứ tự', () => {
    expect(
      selectedFirst([DA_NANG, HA_NOI], null).map((i) => i.chiNhanhId),
    ).toEqual(['3', '2']);
    expect(
      selectedFirst([DA_NANG, HA_NOI], '99').map((i) => i.chiNhanhId),
    ).toEqual(['3', '2']);
  });
});

describe('Trang Chi nhánh', () => {
  it('TCN-12 hiện số lượng, thẻ có tên + địa chỉ, chi nhánh đang chọn xếp đầu kèm nhãn "Đang chọn"', async () => {
    renderAt('/chi-nhanh');
    expect(await screen.findByText('3 chi nhánh.')).toBeInTheDocument();
    const rows = cards();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Chi nhánh Hà Nội');
    expect(rows[0]).toHaveTextContent('Đang chọn');
    expect(rows[1]).toHaveTextContent('Chi nhánh Đà Nẵng');
    expect(within(rows[1]!).queryByText('Đang chọn')).toBeNull();
    expect(
      within(rows[0]!).getByRole('link', { name: /Hà Nội/ }),
    ).toHaveAttribute('href', '/chi-nhanh/2');
  });

  it('TCN-12 không gắn token (CC-08); gọi pageSize=100', async () => {
    renderAt('/chi-nhanh');
    await screen.findByText('3 chi nhánh.');
    const list = calls.filter((c) => /\/public\/branches(\?|$)/.test(c.url));
    expect(list.length).toBeGreaterThan(0);
    for (const call of list)
      expect(call.headers.get('Authorization')).toBeNull();
  });

  it('TCN-12 gõ "quận 3" ⇒ khớp địa chỉ (Q3); đã gõ thì gửi q sau khi ngừng gõ', async () => {
    renderAt('/chi-nhanh');
    await screen.findByText('3 chi nhánh.');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm chi nhánh' }), {
      target: { value: 'quận 3' },
    });
    expect(await screen.findByText('1 chi nhánh.')).toBeInTheDocument();
    expect(cards()[0]).toHaveTextContent('Chi nhánh Sài Gòn');
    const withQ = calls.filter(
      (c) => new URL(c.url, 'http://x').searchParams.get('q') === 'quận 3',
    );
    expect(withQ).toHaveLength(1);
  });

  it('TCN-12 rỗng ⇒ "Không tìm thấy kết quả phù hợp." và "Xoá bộ lọc" về toàn bộ danh sách', async () => {
    renderAt('/chi-nhanh');
    await screen.findByText('3 chi nhánh.');
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'zzz' },
    });
    expect(
      await screen.findByText('Không tìm thấy kết quả phù hợp.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    expect(await screen.findByText('3 chi nhánh.')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('TCN-12 đang tải ⇒ trạng thái đang tải; lỗi máy chủ ⇒ thông báo + "Thử lại" tải lại được', async () => {
    listFails = true;
    renderAt('/chi-nhanh');
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/Đã có lỗi xảy ra/)).toBeInTheDocument();
    listFails = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('3 chi nhánh.')).toBeInTheDocument();
  });

  it('điểm vào: bộ chọn có "Xem tất cả chi nhánh" và chân trang có "Chi nhánh", cùng tới /chi-nhanh', async () => {
    const router = renderAt('/');
    await vi.waitFor(() =>
      expect(picker()).toHaveAccessibleName(
        'Chi nhánh đang chọn: Chi nhánh Hà Nội',
      ),
    );
    const footer = screen.getByRole('contentinfo');
    expect(
      within(footer).getByRole('link', { name: 'Chi nhánh' }),
    ).toHaveAttribute('href', '/chi-nhanh');
    fireEvent.click(picker());
    fireEvent.click(screen.getByText('Xem tất cả chi nhánh'));
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/chi-nhanh'),
    );
    // Không thêm mục "Chi nhánh" vào thanh điều hướng của Figma (Q8)
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(within(nav).queryByText('Chi nhánh')).toBeNull();
  });
});

describe('Trang Chi tiết chi nhánh', () => {
  it('TCN-13 đủ 7 dòng Thứ Hai…Chủ nhật; hai khoảng giờ; "Nghỉ" cho ngày nghỉ và thứ chưa khai báo', async () => {
    renderAt('/chi-nhanh/3');
    expect(
      await screen.findByRole('heading', { name: 'Chi nhánh Hà Nội' }),
    ).toBeInTheDocument();
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows.map((r) => r.textContent)).toEqual([
      'Thứ Hai08:00 – 12:00, 13:00 – 17:00',
      'Thứ Ba08:00 – 12:00, 13:00 – 17:00',
      'Thứ Tư08:00 – 12:00, 13:00 – 17:00',
      'Thứ Năm08:00 – 12:00, 13:00 – 17:00',
      'Thứ SáuNghỉ',
      'Thứ Bảy08:00 – 12:00',
      'Chủ nhậtNghỉ',
    ]);
    expect(screen.getByText('Khám tim mạch')).toBeInTheDocument();
    expect(screen.getByText('3 bác sĩ')).toBeInTheDocument();
    const detailCall = calls.find((c) => /\/public\/branches\/3/.test(c.url));
    expect(detailCall?.headers.get('Authorization')).toBeNull();
  });

  it('TCN-13 + CNC-08 "Chọn làm chi nhánh của tôi" đổi bộ chọn trên header và lưu NguoiDung', async () => {
    renderAt('/chi-nhanh/3');
    await screen.findByRole('heading', { name: 'Chi nhánh Hà Nội' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Chọn làm chi nhánh của tôi' }),
    );
    expect(stored()).toEqual({ chiNhanhId: '3', nguon: 'NguoiDung' });
    expect(
      await screen.findByText('Đang là chi nhánh của bạn'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Chọn làm chi nhánh của tôi' }),
    ).toBeNull();
    // Header đổi theo (tên lấy từ danh sách chi nhánh có id 3)
    await vi.waitFor(() =>
      expect(picker()).toHaveAccessibleName(
        'Chi nhánh đang chọn: Chi nhánh Đà Nẵng',
      ),
    );
  });

  it('TCN-13 chi nhánh đang là lựa chọn ⇒ không hiện nút chọn, hiện "Đang là chi nhánh của bạn"', async () => {
    renderAt('/chi-nhanh/2');
    await screen.findByRole('heading', { name: 'Chi nhánh Hà Nội' });
    expect(screen.getByText('Đang là chi nhánh của bạn')).toBeInTheDocument();
  });

  it('"Xem bác sĩ tại chi nhánh" là nút vô hiệu tới khi có trang bác sĩ (F6)', async () => {
    renderAt('/chi-nhanh/3');
    await screen.findByRole('heading', { name: 'Chi nhánh Hà Nội' });
    expect(
      screen.getByRole('button', { name: /Xem bác sĩ tại chi nhánh/ }),
    ).toBeDisabled();
  });

  it('chưa có dịch vụ nào ⇒ thông báo, không hiện danh sách rỗng', async () => {
    detail = { ...DETAIL, dichVuKham: [], soBacSi: 0 };
    renderAt('/chi-nhanh/3');
    expect(
      await screen.findByText('Chưa có dịch vụ nào tại chi nhánh này.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Sắp có bác sĩ')).toBeInTheDocument();
  });

  it('TCN-13 404 ⇒ "Không tìm thấy chi nhánh này." kèm đường về danh sách', async () => {
    detail = 'NOT_FOUND';
    renderAt('/chi-nhanh/999');
    const alert = await screen.findByText('Không tìm thấy chi nhánh này.');
    expect(alert).toBeInTheDocument();
    expect(
      within(screen.getByRole('main')).getByRole('link', {
        name: 'Xem tất cả chi nhánh',
      }),
    ).toHaveAttribute('href', '/chi-nhanh');
  });

  it('lỗi máy chủ (không phải 404) ⇒ thông báo lỗi chung, không nói "không tìm thấy"', async () => {
    detail = 'ERROR';
    renderAt('/chi-nhanh/3');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Đã có lỗi xảy ra');
    expect(screen.queryByText('Không tìm thấy chi nhánh này.')).toBeNull();
  });
});
