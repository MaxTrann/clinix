import { fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router';
import type { AdminMe } from '../../admin-me';
import { AdminMeProvider } from '../../admin-me-context';
import {
  SYSTEM,
  apiError,
  json,
  type RecordedRequest,
} from '../../patient-accounts/testing/patient-accounts-test-kit';
import { StaffAccountsPage } from '../staff-accounts-page';
import type {
  ActivationLink,
  DoctorDependents,
  StaffAccount,
} from '../staff-types';

// Dụng cụ chung của test admin F8 (chỉ dùng trong test): nhân sự mẫu (DỮ LIỆU GIẢ, `@example.invalid`), API giả CÓ TRẠNG THÁI ở mức hợp đồng B17 (danh sách,
// chi tiết), B18 (khoá, mở khoá), B20 (gửi lại) và B7 (chi nhánh), cùng bộ dựng trang. Không có mật khẩu, token, liên kết kích hoạt hay thông tin thật.

/** Hạn của liên kết mà lần gửi lại thành công của API giả cấp: 10:00 giờ Việt Nam ngày 25/11/2026. */
export const RESEND_EXPIRY = '2026-11-25T03:00:00.000Z';

const BRANCH_5 = { chiNhanhId: '5', ten: 'Chi nhánh Quận 1' };
const BRANCH_6 = { chiNhanhId: '6', ten: 'Chi nhánh Quận 3' };
export const BRANCHES = [BRANCH_5, BRANCH_6];

export function makeStaff(
  n: number,
  overrides: Partial<StaffAccount> = {},
): StaffAccount {
  return {
    taiKhoanId: String(n),
    loaiTaiKhoan: 'BacSi',
    hoTen: `Nhân sự ${n}`,
    email: `ns${n}@example.invalid`,
    soDienThoai: `09100000${String(n).padStart(2, '0')}`,
    trangThai: 'DangHoatDong',
    thoiDiemTao: '2026-11-18T17:30:00.000Z',
    chiNhanh: BRANCH_5,
    ...overrides,
  };
}

/** Quản trị viên: `scope` quyết định `chiNhanh` và `phamViQuanTri` như B17 (Toàn hệ thống thì `chiNhanh` là `null`). */
export function makeAdmin(
  n: number,
  scope: 'ToanHeThong' | 'ChiNhanh',
  overrides: Partial<StaffAccount> = {},
): StaffAccount {
  return makeStaff(n, {
    loaiTaiKhoan: 'QuanTriVien',
    hoTen: `Quản trị ${n}`,
    phamViQuanTri: scope,
    chiNhanh: scope === 'ToanHeThong' ? null : BRANCH_5,
    ...overrides,
  });
}

export const validLink = (
  hetHanLuc = '2026-11-24T10:30:00.000Z',
): ActivationLink => ({
  trangThai: 'HOP_LE',
  hetHanLuc,
});

export const noDependents = (): DoctorDependents => ({
  lichHen: { tong: 0, muc: [] },
  caLamViec: { tong: 0, muc: [] },
});

type Respond = (request: RecordedRequest) => Response | Promise<Response>;

export interface FakeStaffApiOptions {
  scope?: AdminMe;
  accounts?: StaffAccount[];
  /** Id của người đang đăng nhập: khoá chính mình thì API trả 409 `TU_KHOA_TAI_KHOAN` (B18). */
  selfId?: string;
  /** Việc phụ thuộc của Bác sĩ (theo id): API chỉ trả khi khoá Bác sĩ. Mặc định rỗng. */
  dependents?: Record<string, DoctorDependents>;
  branches?: { chiNhanhId: string; ten: string }[];
}

/** Thay `fetch` toàn cục bằng API giả; gọi `vi.unstubAllGlobals()` ở afterEach. */
export function installFakeStaffApi(options: FakeStaffApiOptions = {}) {
  const scope = options.scope ?? SYSTEM;
  const accounts = (options.accounts ?? []).map((account) => ({ ...account }));
  const branches = options.branches ?? BRANCHES;
  const requests: RecordedRequest[] = [];
  const overrides: {
    match: (r: RecordedRequest) => boolean;
    respond: Respond;
    once: boolean;
  }[] = [];

  const find = (id: string) => accounts.find((a) => a.taiKhoanId === id);
  // PLAN 5.6, Q27: Chi nhánh chỉ thấy Bác sĩ và Lễ tân của chi nhánh mình, KHÔNG BAO GIỜ thấy Quản trị viên
  const visible = (account: StaffAccount) =>
    scope.phamVi === 'ToanHeThong' ||
    (account.loaiTaiKhoan !== 'QuanTriVien' &&
      account.chiNhanh?.chiNhanhId === scope.chiNhanh.id);
  // Danh sách không có `lienKetKichHoat` (chỉ chi tiết có)
  const listView = (account: StaffAccount) => {
    const rest: Partial<StaffAccount> = { ...account };
    delete rest.lienKetKichHoat;
    return rest;
  };
  const detailView = (account: StaffAccount) => ({
    ...listView(account),
    lienKetKichHoat: account.lienKetKichHoat ?? null,
  });

  function list(request: RecordedRequest): Response {
    const { search } = request;
    const page = Number(search.get('page') ?? '1');
    const pageSize = Number(search.get('pageSize') ?? '20');
    if (!Number.isInteger(page) || page < 1)
      return apiError(400, 'DU_LIEU_KHONG_HOP_LE', [
        { truong: 'page', ma: 'TRANG_KHONG_HOP_LE' },
      ]);
    const roles = search.getAll('vaiTro');
    const status = search.get('trangThai');
    const branchId = search.get('chiNhanhId');
    const text = (search.get('q') ?? '').toLowerCase();
    const matches = accounts.filter((a) => {
      if (!visible(a)) return false;
      if (roles.length > 0 && !roles.includes(a.loaiTaiKhoan)) return false;
      if (status !== null && a.trangThai !== status) return false;
      // Chi nhánh bị API bỏ qua `chiNhanhId` (C1); chỉ Toàn hệ thống lọc được
      if (
        scope.phamVi === 'ToanHeThong' &&
        branchId !== null &&
        a.chiNhanh?.chiNhanhId !== branchId
      )
        return false;
      if (text === '') return true;
      return [a.hoTen, a.email, a.soDienThoai].some((value) =>
        value.toLowerCase().includes(text),
      );
    });
    // B17 sắp CỐ ĐỊNH theo họ tên rồi mã tài khoản (phân trang ổn định)
    matches.sort(
      (a, b) =>
        a.hoTen.localeCompare(b.hoTen, 'vi') ||
        Number(a.taiKhoanId) - Number(b.taiKhoanId),
    );
    return json({
      items: matches
        .slice((page - 1) * pageSize, page * pageSize)
        .map(listView),
      total: matches.length,
      page,
      pageSize,
    });
  }

  // Thứ tự lỗi đúng B18 (PLAN 5.6): 404 → 409 tự khoá → 409 chờ kích hoạt → 409 trạng thái → 409 Toàn hệ thống cuối cùng
  function lockOrUnlock(id: string, action: 'lock' | 'unlock'): Response {
    const account = find(id);
    if (account === undefined || !visible(account))
      return apiError(404, 'KHONG_TIM_THAY');
    if (action === 'lock' && options.selfId === id)
      return apiError(409, 'TU_KHOA_TAI_KHOAN');
    if (account.trangThai === 'ChoKichHoat')
      return apiError(409, 'TAI_KHOAN_CHO_KICH_HOAT');
    if (action === 'lock' && account.trangThai === 'NgungHoatDong')
      return apiError(409, 'TRANG_THAI_KHONG_PHU_HOP');
    if (action === 'unlock' && account.trangThai === 'DangHoatDong')
      return apiError(409, 'TRANG_THAI_KHONG_PHU_HOP');
    if (
      action === 'lock' &&
      account.loaiTaiKhoan === 'QuanTriVien' &&
      account.phamViQuanTri === 'ToanHeThong' &&
      !accounts.some(
        (other) =>
          other.taiKhoanId !== id &&
          other.loaiTaiKhoan === 'QuanTriVien' &&
          other.phamViQuanTri === 'ToanHeThong' &&
          other.trangThai === 'DangHoatDong',
      )
    )
      return apiError(409, 'CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG');
    if (action === 'unlock') {
      account.trangThai = 'DangHoatDong';
      return json({
        taiKhoanId: id,
        loaiTaiKhoan: account.loaiTaiKhoan,
        trangThai: 'DangHoatDong',
      });
    }
    account.trangThai = 'NgungHoatDong';
    return json({
      taiKhoanId: id,
      loaiTaiKhoan: account.loaiTaiKhoan,
      trangThai: 'NgungHoatDong',
      soPhienThuHoi: 1,
      ...(account.loaiTaiKhoan === 'BacSi'
        ? { phuThuoc: options.dependents?.[id] ?? noDependents() }
        : {}),
    });
  }

  function resend(id: string): Response {
    const account = find(id);
    if (account === undefined || !visible(account))
      return apiError(404, 'KHONG_TIM_THAY');
    if (account.trangThai !== 'ChoKichHoat')
      return apiError(409, 'TAI_KHOAN_KHONG_CHO_KICH_HOAT');
    account.lienKetKichHoat = validLink(RESEND_EXPIRY);
    return json({
      taiKhoanId: id,
      guiEmail: { ketQua: 'DaGui' },
      hanLienKet: RESEND_EXPIRY,
    });
  }

  function handle(request: RecordedRequest): Response {
    const { method, path } = request;
    if (method === 'GET' && path === '/admin/accounts') return list(request);
    if (method === 'GET' && path === '/admin/branches')
      return json({
        items: branches,
        total: branches.length,
        page: 1,
        pageSize: 100,
      });
    const detail = /^\/admin\/accounts\/([^/]+)$/.exec(path);
    if (method === 'GET' && detail !== null) {
      const account = find(decodeURIComponent(detail[1]));
      return account === undefined || !visible(account)
        ? apiError(404, 'KHONG_TIM_THAY')
        : json(detailView(account));
    }
    const action =
      /^\/admin\/accounts\/([^/]+)\/(lock|unlock|resend-activation)$/.exec(
        path,
      );
    if (method === 'POST' && action !== null) {
      const id = decodeURIComponent(action[1]);
      return action[2] === 'resend-activation'
        ? resend(id)
        : lockOrUnlock(id, action[2] as 'lock' | 'unlock');
    }
    return apiError(404, 'KHONG_TIM_THAY');
  }

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const request: RecordedRequest = {
        method: init?.method ?? 'GET',
        path: url.pathname.replace(/^\/api/, ''),
        search: url.searchParams,
        body:
          typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
      };
      requests.push(request);
      const index = overrides.findIndex((entry) => entry.match(request));
      if (index >= 0) {
        const entry = overrides[index];
        if (entry.once) overrides.splice(index, 1);
        return entry.respond(request);
      }
      return handle(request);
    },
  );
  vi.stubGlobal('fetch', fetchMock);

  return {
    // Để test truy cập (khung Admin thật + API xác thực giả) dựng bộ định tuyến `fetch` riêng
    fetch: fetchMock,
    requests,
    accounts,
    /** Thay câu trả lời của lời gọi khớp `match`; `once` (mặc định) chỉ áp cho MỘT lời gọi đầu tiên. */
    override(
      match: (r: RecordedRequest) => boolean,
      respond: Respond,
      once = true,
    ) {
      overrides.push({ match, respond, once });
    },
    calls(method: string, path: string | RegExp) {
      return requests.filter(
        (r) =>
          r.method === method &&
          (typeof path === 'string' ? r.path === path : path.test(r.path)),
      );
    },
    lists: () =>
      requests.filter(
        (r) => r.method === 'GET' && r.path === '/admin/accounts',
      ),
    details: () =>
      requests.filter(
        (r) => r.method === 'GET' && /^\/admin\/accounts\/[^/]+$/.test(r.path),
      ),
    posts: () => requests.filter((r) => r.method === 'POST'),
  };
}

export type FakeStaffApi = ReturnType<typeof installFakeStaffApi>;

export function renderStaffPage(
  options: { scope?: AdminMe; strict?: boolean } = {},
) {
  const page = (
    <MemoryRouter>
      <AdminMeProvider value={options.scope ?? SYSTEM}>
        <StaffAccountsPage />
      </AdminMeProvider>
    </MemoryRouter>
  );
  return render(options.strict ? <StrictMode>{page}</StrictMode> : page);
}

/** Mở panel chi tiết của một nhân sự và chờ panel hiện (tiêu đề là họ tên). */
export async function openStaffDetail(name: string) {
  fireEvent.click(
    await screen.findByRole('button', { name: `Xem chi tiết ${name}` }),
  );
  return screen.findByRole('dialog', { name });
}
