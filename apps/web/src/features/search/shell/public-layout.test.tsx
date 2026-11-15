import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from '../../../router/routes';
import { emptyPublicHomeResponse } from '../../../test/empty-public-home-response';
import {
  createFakeAuthApi,
  createFakeLocks,
} from '../../../test/fake-auth-api';
import { fakeMatchMedia } from '../../../test/fake-match-media';
import { login, resetAuthForTest } from '../../auth/auth-session';
import { setAuthState } from '../../auth/auth-store';

// search F1. Mã ca KC-nn lấy từ PLAN search mục 7.7.
const CLINIC_INFO = {
  tenThuongHieu: 'CLINIX',
  diaChiTruSo: '12 Đường Mẫu, TP. Hồ Chí Minh',
  duongDayNong: '19001234',
  email: 'support@example.com',
};

let api: ReturnType<typeof createFakeAuthApi>;
let publicCalls: { url: string; headers: Headers }[];
let clinicInfoResponse: () => Response | Promise<Response>;

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  resetAuthForTest();
  api = createFakeAuthApi();
  publicCalls = [];
  clinicInfoResponse = () => jsonResponse(200, CLINIC_INFO);
  // Điều hướng đầy đủ chỉ dựng từ 1280 px (search F14, M5); happy-dom mặc định rộng 1024 nên giả bề ngang cho các ca header
  fakeMatchMedia(1280);
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/public/')) {
        publicCalls.push({
          url: String(input),
          headers: new Headers(init?.headers),
        });
        const homeResponse = emptyPublicHomeResponse(String(input));
        return Promise.resolve(homeResponse ?? clinicInfoResponse());
      }
      return api.fetch(input, init);
    }),
  );
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: createFakeLocks(),
  });
});

afterEach(() => {
  resetAuthForTest();
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

const clinicInfoCalls = () =>
  publicCalls.filter((call) => call.url.includes('/public/clinic-info'));

const mainNav = () =>
  screen.getByRole('navigation', { name: 'Điều hướng chính' });

describe('PublicHeader', () => {
  it('KC-01 mục theo thứ tự Figma; Trang chủ có aria-current; mục chưa có trang là nút vô hiệu', () => {
    setAuthState({ status: 'unauthenticated' });
    renderAt('/');
    const nav = within(mainNav());
    const labels = [
      ...nav.getAllByRole('link'),
      ...nav.getAllByRole('button'),
    ].map((el) => el.textContent?.replace(' (chưa được triển khai)', ''));
    expect(labels).toEqual(
      expect.arrayContaining([
        'Trang chủ',
        'Dịch vụ khám',
        'Chuyên khoa',
        'Bác sĩ',
        'Cẩm nang',
        'Liên hệ',
      ]),
    );
    // F6: Bác sĩ mở trang Đội ngũ bác sĩ
    expect(nav.getByRole('link', { name: 'Bác sĩ' })).toHaveAttribute(
      'href',
      '/bac-si',
    );
    // F4: Chuyên khoa đã có trang nên là liên kết thật
    expect(nav.getByRole('link', { name: 'Chuyên khoa' })).toHaveAttribute(
      'href',
      '/chuyen-khoa',
    );
    expect(nav.getByRole('link', { name: 'Trang chủ' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    for (const name of ['Cẩm nang', 'Liên hệ']) {
      expect(
        nav.getByRole('button', { name: new RegExp(name) }),
      ).toBeDisabled();
    }
    // search F5: "Đặt lịch khám" mở luồng chọn dịch vụ nên là liên kết thật
    expect(
      within(screen.getByRole('banner')).getByRole('link', {
        name: /Đặt lịch khám/,
      }),
    ).toHaveAttribute('href', '/dat-lich');
  });

  it('Dịch vụ khám: mở/đóng bằng nút và Esc, chưa có dữ liệu thì báo chưa có nhóm', () => {
    setAuthState({ status: 'unauthenticated' });
    renderAt('/');
    const trigger = screen.getByRole('button', { name: 'Dịch vụ khám' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Chưa có nhóm dịch vụ nào.')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('KC-02 Khách vãng lai: "Đăng nhập" dẫn tới /dang-nhap', () => {
    setAuthState({ status: 'unauthenticated' });
    renderAt('/');
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute(
      'href',
      '/dang-nhap',
    );
  });

  it('KC-02 + KC-03 đã đăng nhập: vẫn ở trang chủ, nút họ tên có "Trang của tôi" và "Đăng xuất" gọi đúng một lần', async () => {
    await login('a@example.invalid', 'mat-khau');
    const router = renderAt('/');
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByRole('link', { name: 'Đăng nhập' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Bệnh nhân mẫu/ }));
    expect(screen.getByRole('link', { name: 'Trang của tôi' })).toHaveAttribute(
      'href',
      '/benh-nhan',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await vi.waitFor(() => expect(api.logoutCalls).toBe(1));
  });
});

describe('PublicFooter', () => {
  it('KC-05 hiện liên hệ từ /public/clinic-info, gọi không kèm Authorization', async () => {
    await login('a@example.invalid', 'mat-khau');
    renderAt('/');
    expect(
      await screen.findByText(CLINIC_INFO.diaChiTruSo),
    ).toBeInTheDocument();
    expect(screen.getByText('19001234')).toBeInTheDocument();
    expect(screen.getByText('support@example.com')).toBeInTheDocument();
    // CC-08: đang đăng nhập mà lời gọi công khai không gắn token
    // Từ search F2 khung còn gọi danh sách chi nhánh; mọi lời gọi công khai đều không gắn token
    expect(clinicInfoCalls()).toHaveLength(1);
    for (const call of publicCalls) {
      expect(call.headers.get('Authorization')).toBeNull();
    }
  });

  it('KC-05 trường null ẩn dòng; cả bốn null ⇒ không có khối liên hệ', async () => {
    clinicInfoResponse = () =>
      jsonResponse(200, {
        tenThuongHieu: null,
        diaChiTruSo: null,
        duongDayNong: '19001234',
        email: null,
      });
    setAuthState({ status: 'unauthenticated' });
    renderAt('/');
    expect(await screen.findByText('19001234')).toBeInTheDocument();
    expect(screen.queryByText(/@/)).toBeNull();
    expect(
      screen.getAllByRole('heading', { name: 'Thông tin liên hệ' }),
    ).toHaveLength(1);
  });

  it('KC-05 API lỗi: chân trang vẫn hiện phần tĩnh, không khối liên hệ, không báo lỗi', async () => {
    clinicInfoResponse = () =>
      jsonResponse(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' });
    setAuthState({ status: 'unauthenticated' });
    renderAt('/');
    expect(
      await screen.findByText('© 2026 CLINIX Clinic. Bảo lưu mọi quyền.'),
    ).toBeInTheDocument();
    await vi.waitFor(() => expect(clinicInfoCalls()).toHaveLength(1));
    expect(
      screen.queryByRole('heading', { name: 'Thông tin liên hệ' }),
    ).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Phạm vi của khung', () => {
  it('KC-06 trang đăng nhập không có header/footer công khai', async () => {
    setAuthState({ status: 'unauthenticated' });
    renderAt('/dang-nhap');
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    expect(
      screen.queryByRole('navigation', { name: 'Điều hướng chính' }),
    ).toBeNull();
    expect(screen.queryByText(/Bảo lưu mọi quyền/)).toBeNull();
    expect(publicCalls).toHaveLength(0);
  });

  it('KC-10 đường dẫn không tồn tại vẫn có header/footer', async () => {
    setAuthState({ status: 'unauthenticated' });
    renderAt('/duong-khong-ton-tai');
    expect(
      screen.getByRole('heading', { name: 'Không tìm thấy trang' }),
    ).toBeInTheDocument();
    expect(mainNav()).toBeInTheDocument();
    expect(screen.getByText(/Bảo lưu mọi quyền/)).toBeInTheDocument();
  });
});

describe('PublicFooter trong khung công khai (search F14, G4)', () => {
  const page = (names: string[]) => ({
    items: names.map((ten, index) => ({
      chuyenKhoaId: String(index + 1),
      ten,
      moTa: null,
      anhDaiDien: null,
      soBacSi: 1,
    })),
    total: names.length,
    page: 1,
    pageSize: 8,
    soCoBacSi: names.length,
  });

  function stubSpecialties(respond: () => Response, calls: string[] = []) {
    const base = globalThis.fetch;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/public/specialties') {
        calls.push(url.search);
        return Promise.resolve(respond());
      }
      return base(input, init);
    });
  }

  it('UIS-08 chân trang có cột "Chuyên khoa" từ GET /public/specialties (8 tên đầu, không lọc chi nhánh; Figma 257:1057)', async () => {
    setAuthState({ status: 'unauthenticated' });
    const calls: string[] = [];
    stubSpecialties(
      () => jsonResponse(200, page(['Tim mạch', 'Nhi khoa'])),
      calls,
    );
    renderAt('/khong-co-trang-nay');
    const footer = within(await screen.findByRole('contentinfo'));
    expect(
      await footer.findByRole('link', { name: 'Tim mạch' }),
    ).toHaveAttribute('href', '/chuyen-khoa/1');
    expect(footer.getByRole('link', { name: 'Nhi khoa' })).toHaveAttribute(
      'href',
      '/chuyen-khoa/2',
    );
    expect(
      footer.getByRole('heading', { name: 'Chuyên khoa' }),
    ).toBeInTheDocument();
    const query = new URLSearchParams(calls[0]);
    expect(query.get('pageSize')).toBe('8');
    expect(query.has('chiNhanhId')).toBe(false);
  });

  it('UIS-08 lỗi tải chuyên khoa ⇒ ẩn cột "Chuyên khoa", chân trang vẫn hiện liên hệ (KC-05)', async () => {
    setAuthState({ status: 'unauthenticated' });
    stubSpecialties(() =>
      jsonResponse(400, { maLoi: 'BO_LOC_KHONG_HOP_LE', thongBao: 'Lỗi' }),
    );
    renderAt('/khong-co-trang-nay');
    const footer = within(await screen.findByRole('contentinfo'));
    expect(
      await footer.findByText('12 Đường Mẫu, TP. Hồ Chí Minh'),
    ).toBeInTheDocument();
    expect(footer.queryByRole('heading', { name: 'Chuyên khoa' })).toBeNull();
  });
});
