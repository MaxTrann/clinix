import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from '../../../router/routes';
import type { BranchSummary } from '../api/search-types';
import { resetSelectedBranchForTest } from '../../../shared/branch-selection';
import {
  createFakeAuthApi,
  createFakeLocks,
} from '../../../test/fake-auth-api';
import { login, resetAuthForTest } from '../../auth/auth-session';
import { setAuthState } from '../../auth/auth-store';
import {
  LOCATION_DENIED_NOTICE,
  LOCATION_FAILED_NOTICE,
} from './use-public-branches';

// search F2. Mã ca CNC-nn lấy từ PLAN search mục 7.3.
const HCM_BRANCH: BranchSummary = {
  chiNhanhId: '1',
  ten: 'Chi nhánh Sài Gòn',
  diaChi: '1 Đường Mẫu, TP.HCM',
  toaDoLat: '10.7769000',
  toaDoLng: '106.7009000',
};
const HANOI_BRANCH: BranchSummary = {
  chiNhanhId: '2',
  ten: 'Chi nhánh Hà Nội',
  diaChi: '2 Đường Mẫu, Hà Nội',
  toaDoLat: '21.0285000',
  toaDoLng: '105.8542000',
};
const NO_COORDS_BRANCH: BranchSummary = {
  chiNhanhId: '3',
  ten: 'Chi nhánh Chưa Có Toạ Độ',
  diaChi: '3 Đường Mẫu',
  toaDoLat: null,
  toaDoLng: null,
};
const STORAGE_KEY = 'clinix.chiNhanhDangChon';

const open = { sang: { tu: '08:00', den: '12:00' }, chieu: null };
const detailOf = (branch: BranchSummary) => ({
  ...branch,
  lichHoatDong: [1, 2, 3, 4, 5, 6, 7].map((thuTrongTuan) => ({
    thuTrongTuan,
    hoatDong: thuTrongTuan === 7 ? null : open,
  })),
  dichVuKham: [],
  soBacSi: 0,
});

let api: ReturnType<typeof createFakeAuthApi>;
let branches: BranchSummary[];
let branchListResponse: () => Response;
let detailFails = false;
let publicCalls: { url: string; headers: Headers; body: unknown }[];
let getCurrentPosition: ReturnType<typeof vi.fn>;

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function stubGeolocation(
  behaviour: (
    success: (position: GeolocationPosition) => void,
    failure: (error: { code: number }) => void,
  ) => void,
) {
  getCurrentPosition = vi.fn(behaviour);
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  });
}

const positionAt = (latitude: number, longitude: number) =>
  ({ coords: { latitude, longitude } }) as GeolocationPosition;

beforeEach(() => {
  resetAuthForTest();
  resetSelectedBranchForTest();
  window.localStorage.clear();
  api = createFakeAuthApi();
  branches = [HCM_BRANCH, HANOI_BRANCH, NO_COORDS_BRANCH];
  branchListResponse = () =>
    jsonResponse(200, {
      items: branches,
      total: branches.length,
      page: 1,
      pageSize: 100,
    });
  detailFails = false;
  publicCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes('/public/')) return api.fetch(input, init);
      publicCalls.push({
        url,
        headers: new Headers(init?.headers),
        body: init?.body ?? null,
      });
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
      const detail = /\/public\/branches\/(\d+)/.exec(url);
      if (detail && detailFails) {
        return Promise.resolve(
          jsonResponse(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
        );
      }
      if (detail) {
        const found = branches.find((b) => b.chiNhanhId === detail[1]);
        return Promise.resolve(
          found
            ? jsonResponse(200, detailOf(found))
            : jsonResponse(404, { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }),
        );
      }
      return Promise.resolve(branchListResponse());
    }),
  );
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: createFakeLocks(),
  });
  // Mặc định: từ chối vị trí; từng ca tự ghi đè khi cần
  stubGeolocation((_success, failure) => failure({ code: 1 }));
  setAuthState({ status: 'unauthenticated' });
});

afterEach(() => {
  resetAuthForTest();
  resetSelectedBranchForTest();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderHome() {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: ['/'],
  });
  render(<RouterProvider router={router} />);
  return router;
}

const picker = () =>
  screen.getByRole('button', { name: /^Chi nhánh đang chọn:/ });
const stored = () =>
  JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as unknown;

describe('Chi nhánh đang chọn — khởi tạo lần đầu', () => {
  it('CNC-01 cấp quyền: chọn chi nhánh gần nhất, lưu nguon DinhVi, header hiện tên', async () => {
    stubGeolocation((success) => success(positionAt(21.0, 105.8)));
    renderHome();
    await vi.waitFor(() =>
      expect(picker()).toHaveAccessibleName(
        'Chi nhánh đang chọn: Chi nhánh Hà Nội',
      ),
    );
    expect(stored()).toEqual({ chiNhanhId: '2', nguon: 'DinhVi' });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('CNC-02 từ chối quyền: "Toàn quốc"; tải lại trang không xin lại', async () => {
    renderHome();
    await vi.waitFor(() =>
      expect(stored()).toEqual({ chiNhanhId: null, nguon: 'DinhVi' }),
    );
    expect(picker()).toHaveAccessibleName('Chi nhánh đang chọn: Toàn quốc');
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);

    // "Tải lại trang": quên bộ nhớ, dựng lại ứng dụng với localStorage còn nguyên
    resetSelectedBranchForTest();
    renderHome();
    await vi.waitFor(() => expect(publicCalls.length).toBeGreaterThan(2));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('CNC-03 hết giờ hoặc không lấy được vị trí: "Toàn quốc" kèm thông báo nhỏ', async () => {
    stubGeolocation((_success, failure) => failure({ code: 3 }));
    renderHome();
    await vi.waitFor(() =>
      expect(stored()).toEqual({ chiNhanhId: null, nguon: 'DinhVi' }),
    );
    fireEvent.click(picker());
    expect(await screen.findByText(LOCATION_FAILED_NOTICE)).toBeInTheDocument();
  });

  it('CNC-02 từ chối thì không có thông báo lỗi kỹ thuật lúc đầu', async () => {
    renderHome();
    await vi.waitFor(() => expect(stored()).not.toBeNull());
    fireEvent.click(picker());
    expect(screen.queryByText(LOCATION_FAILED_NOTICE)).toBeNull();
    expect(screen.queryByText(LOCATION_DENIED_NOTICE)).toBeNull();
  });

  it('CNC-04 không chi nhánh nào có toạ độ: "Toàn quốc", không gọi Geolocation', async () => {
    branches = [NO_COORDS_BRANCH];
    renderHome();
    await vi.waitFor(() =>
      expect(stored()).toEqual({ chiNhanhId: null, nguon: 'DinhVi' }),
    );
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('CNC-11 trình duyệt không có navigator.geolocation: "Toàn quốc"', async () => {
    Reflect.deleteProperty(navigator, 'geolocation');
    // Nếu môi trường vẫn có sẵn thuộc tính ở prototype thì bỏ qua nhánh này
    if ('geolocation' in navigator) return;
    renderHome();
    await vi.waitFor(() =>
      expect(stored()).toEqual({ chiNhanhId: null, nguon: 'DinhVi' }),
    );
  });

  it('API danh sách lỗi: không lưu gì (thử lại ở lần vào sau), trang vẫn dùng được', async () => {
    branchListResponse = () =>
      jsonResponse(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' });
    renderHome();
    await vi.waitFor(() =>
      expect(publicCalls.some((c) => c.url.includes('pageSize=100'))).toBe(
        true,
      ),
    );
    expect(await screen.findByText(/Bảo lưu mọi quyền/)).toBeInTheDocument();
    expect(stored()).toBeNull();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(picker()).toHaveAccessibleName('Chi nhánh đang chọn: Toàn quốc');
  });
});

describe('Chi nhánh đang chọn — đã có lựa chọn', () => {
  it('CNC-06 đã có lựa chọn của người dùng: không xin quyền, dùng lại', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ chiNhanhId: '1', nguon: 'NguoiDung' }),
    );
    renderHome();
    await vi.waitFor(() =>
      expect(picker()).toHaveAccessibleName(
        'Chi nhánh đang chọn: Chi nhánh Sài Gòn',
      ),
    );
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('CNC-07 chi nhánh đã lưu không còn: về "Toàn quốc"', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ chiNhanhId: '99', nguon: 'NguoiDung' }),
    );
    renderHome();
    await vi.waitFor(() =>
      expect(stored()).toEqual({ chiNhanhId: null, nguon: 'NguoiDung' }),
    );
    expect(picker()).toHaveAccessibleName('Chi nhánh đang chọn: Toàn quốc');
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('CNC-07 dữ liệu lưu bị hỏng: coi như lần đầu', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'khong-phai-json');
    stubGeolocation((success) => success(positionAt(10.8, 106.7)));
    renderHome();
    await vi.waitFor(() =>
      expect(stored()).toEqual({ chiNhanhId: '1', nguon: 'DinhVi' }),
    );
  });

  it('CNC-13 đăng nhập rồi đăng xuất: lựa chọn giữ nguyên', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ chiNhanhId: '2', nguon: 'NguoiDung' }),
    );
    await login('a@example.invalid', 'mat-khau');
    renderHome();
    await vi.waitFor(() =>
      expect(picker()).toHaveAccessibleName(
        'Chi nhánh đang chọn: Chi nhánh Hà Nội',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /Bệnh nhân mẫu/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await vi.waitFor(() => expect(api.logoutCalls).toBe(1));
    expect(stored()).toEqual({ chiNhanhId: '2', nguon: 'NguoiDung' });
  });
});

describe('Bộ chọn trên header', () => {
  beforeEach(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ chiNhanhId: '1', nguon: 'NguoiDung' }),
    );
  });

  it('CNC-10 chọn chi nhánh khác, chọn "Toàn quốc"; đóng bằng Esc và trả focus về nút', async () => {
    renderHome();
    await vi.waitFor(() =>
      expect(picker()).toHaveAccessibleName(
        'Chi nhánh đang chọn: Chi nhánh Sài Gòn',
      ),
    );
    fireEvent.click(picker());
    expect(picker()).toHaveAttribute('aria-expanded', 'true');
    const menu = within(document.getElementById('public-branch-picker')!);
    expect(
      menu.getByRole('button', { name: /Chi nhánh Sài Gòn/ }),
    ).toHaveAttribute('aria-current', 'true');

    fireEvent.click(menu.getByRole('button', { name: /Chi nhánh Hà Nội/ }));
    expect(stored()).toEqual({ chiNhanhId: '2', nguon: 'NguoiDung' });
    expect(picker()).toHaveAccessibleName(
      'Chi nhánh đang chọn: Chi nhánh Hà Nội',
    );
    expect(picker()).toHaveAttribute('aria-expanded', 'false');
    expect(picker()).toHaveFocus();

    fireEvent.click(picker());
    fireEvent.click(
      within(document.getElementById('public-branch-picker')!).getByRole(
        'button',
        { name: 'Toàn quốc' },
      ),
    );
    expect(stored()).toEqual({ chiNhanhId: null, nguon: 'NguoiDung' });

    fireEvent.click(picker());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(picker()).toHaveAttribute('aria-expanded', 'false');
    expect(picker()).toHaveFocus();
  });

  it('CNC-10 "Dùng vị trí của tôi": chọn chi nhánh gần nhất và lưu DinhVi', async () => {
    stubGeolocation((success) => success(positionAt(21.0, 105.8)));
    renderHome();
    await vi.waitFor(() =>
      expect(picker()).toHaveAccessibleName(
        'Chi nhánh đang chọn: Chi nhánh Sài Gòn',
      ),
    );
    fireEvent.click(picker());
    fireEvent.click(
      screen.getByRole('button', { name: 'Dùng vị trí của tôi' }),
    );
    await vi.waitFor(() =>
      expect(stored()).toEqual({ chiNhanhId: '2', nguon: 'DinhVi' }),
    );
  });

  it('CNC-10 bấm "Dùng vị trí của tôi" mà bị chặn: giữ nguyên lựa chọn và báo cách xử lý', async () => {
    renderHome();
    await vi.waitFor(() =>
      expect(picker()).toHaveAccessibleName(
        'Chi nhánh đang chọn: Chi nhánh Sài Gòn',
      ),
    );
    fireEvent.click(picker());
    fireEvent.click(
      screen.getByRole('button', { name: 'Dùng vị trí của tôi' }),
    );
    expect(await screen.findByText(LOCATION_DENIED_NOTICE)).toBeInTheDocument();
    expect(stored()).toEqual({ chiNhanhId: '1', nguon: 'NguoiDung' });
  });

  it('không có trang chi nhánh (F3) thì không hiện liên kết "Xem tất cả chi nhánh"', async () => {
    renderHome();
    await vi.waitFor(() =>
      expect(picker()).toHaveAccessibleName(
        'Chi nhánh đang chọn: Chi nhánh Sài Gòn',
      ),
    );
    fireEvent.click(picker());
    expect(screen.queryByText('Xem tất cả chi nhánh')).toBeNull();
  });
});

describe('Bảo mật và chân trang', () => {
  it('CNC-12 không yêu cầu mạng nào chứa toạ độ người dùng; mọi lời gọi không kèm Authorization', async () => {
    stubGeolocation((success) => success(positionAt(21.0123, 105.8123)));
    await login('a@example.invalid', 'mat-khau');
    renderHome();
    await vi.waitFor(() => expect(stored()).not.toBeNull());
    await vi.waitFor(() =>
      expect(publicCalls.some((c) => /branches\/2/.test(c.url))).toBe(true),
    );
    for (const call of publicCalls) {
      expect(call.url).not.toMatch(/21\.0123|105\.8123/);
      expect(String(call.body ?? '')).not.toMatch(/21\.0123|105\.8123/);
      expect(call.headers.get('Authorization')).toBeNull();
    }
  });

  it('chân trang hiện giờ nhận khám của chi nhánh đang chọn, gộp các thứ liền nhau', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ chiNhanhId: '1', nguon: 'NguoiDung' }),
    );
    renderHome();
    const hours = await screen.findByRole('region', { name: 'Giờ nhận khám' });
    expect(within(hours).getByText('Chi nhánh Sài Gòn')).toBeInTheDocument();
    expect(within(hours).getByText('Thứ 2 – Thứ 7')).toBeInTheDocument();
    expect(within(hours).getByText('Chủ nhật')).toBeInTheDocument();
    expect(within(hours).getByText('Nghỉ')).toBeInTheDocument();
  });

  it('"Toàn quốc": chân trang ẩn khối giờ và không gọi chi tiết chi nhánh', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ chiNhanhId: null, nguon: 'NguoiDung' }),
    );
    renderHome();
    await vi.waitFor(() =>
      expect(publicCalls.some((c) => c.url.includes('pageSize=100'))).toBe(
        true,
      ),
    );
    expect(screen.queryByRole('region', { name: 'Giờ nhận khám' })).toBeNull();
    expect(publicCalls.some((c) => /branches\/\d/.test(c.url))).toBe(false);
  });

  it('đổi chi nhánh ở header thì giờ ở chân trang đổi theo', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ chiNhanhId: '1', nguon: 'NguoiDung' }),
    );
    renderHome();
    await screen.findByRole('region', { name: 'Giờ nhận khám' });
    fireEvent.click(picker());
    fireEvent.click(
      within(document.getElementById('public-branch-picker')!).getByRole(
        'button',
        { name: /Chi nhánh Hà Nội/ },
      ),
    );
    const hours = await screen.findByText('Chi nhánh Hà Nội', {
      selector: 'p',
    });
    expect(hours).toBeInTheDocument();
  });

  it('API chi tiết chi nhánh lỗi: chân trang ẩn khối giờ, không báo lỗi', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ chiNhanhId: '1', nguon: 'NguoiDung' }),
    );
    detailFails = true;
    renderHome();
    await vi.waitFor(() =>
      expect(publicCalls.some((c) => /branches\/1/.test(c.url))).toBe(true),
    );
    expect(screen.queryByRole('region', { name: 'Giờ nhận khám' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
