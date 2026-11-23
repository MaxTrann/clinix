import { fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router';
import type { AdminMe } from '../../admin-me';
import { AdminMeProvider } from '../../admin-me-context';
import type { PatientAccount } from '../../account-common/account-types';
import { PatientAccountsPage } from '../patient-accounts-page';

// Dụng cụ chung của test admin F9 (chỉ dùng trong test): Bệnh nhân mẫu (DỮ LIỆU GIẢ), API giả CÓ TRẠNG THÁI ở mức hợp đồng B17 (danh sách, chi tiết),
// B18 (khoá, mở khoá), B19 (mở khoá no-show), B5 (cấu hình: ngưỡng) và B7 (chi nhánh), cùng bộ dựng trang. Không có mật khẩu, token hay thông tin thật.

export const SYSTEM: AdminMe = { phamVi: 'ToanHeThong' };
export const BRANCH: AdminMe = {
  phamVi: 'ChiNhanh',
  chiNhanh: { id: '5', ten: 'Chi nhánh Quận 1' },
};

export function makePatient(
  n: number,
  overrides: Partial<PatientAccount> = {},
): PatientAccount {
  return {
    taiKhoanId: String(n),
    loaiTaiKhoan: 'BenhNhan',
    hoTen: `Bệnh nhân ${n}`,
    email: `bn${n}@example.test`,
    soDienThoai: `09000000${String(n).padStart(2, '0')}`,
    ngaySinh: '1990-05-07',
    gioiTinh: 'Nam',
    trangThai: 'DangHoatDong',
    diaChi: `Số ${n} đường mẫu`,
    daXacMinhEmail: true,
    thoiDiemTao: '2026-11-18T17:30:00.000Z',
    khoaDatLichDoNoShow: false,
    soLanNoShow: 0,
    ...overrides,
  };
}

// Tám khoá Admin Chi nhánh nhận (sáu trường Q26 + hai khoá kỹ thuật), đúng như B17
const BRANCH_KEYS = [
  'taiKhoanId',
  'loaiTaiKhoan',
  'hoTen',
  'email',
  'soDienThoai',
  'ngaySinh',
  'gioiTinh',
  'trangThai',
] as const;

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const apiError = (
  status: number,
  maLoi: string,
  loi?: { truong: string; ma: string }[],
): Response =>
  json(
    { maLoi, thongBao: 'câu của API', ...(loi === undefined ? {} : { loi }) },
    status,
  );

export interface RecordedRequest {
  method: string;
  // Đường dẫn bỏ tiền tố `/api`, ví dụ `/admin/accounts/7/lock`
  path: string;
  search: URLSearchParams;
  body: unknown;
}

type Respond = (request: RecordedRequest) => Response | Promise<Response>;

export interface FakeApiOptions {
  scope?: AdminMe;
  accounts?: PatientAccount[];
  /** `nguongNoShow: null` hay `chuaCauHinh: true` mô phỏng hệ thống chưa cấu hình. */
  config?: { chuaCauHinh: boolean; nguongNoShow: number | null };
  branches?: { chiNhanhId: string; ten: string }[];
  /** API lỡ trả THỪA khoá cho Admin Chi nhánh (13 khoá thay vì 8): web vẫn chỉ được hiện sáu trường. */
  overfull?: boolean;
}

/** Thay `fetch` toàn cục bằng API giả; gọi `vi.unstubAllGlobals()` ở afterEach. */
export function installFakeApi(options: FakeApiOptions = {}) {
  const scope = options.scope ?? SYSTEM;
  const isSystem = scope.phamVi === 'ToanHeThong';
  const accounts = (options.accounts ?? []).map((account) => ({ ...account }));
  const config = options.config ?? { chuaCauHinh: false, nguongNoShow: 3 };
  const branches = options.branches ?? [
    { chiNhanhId: '5', ten: 'Chi nhánh Quận 1' },
    { chiNhanhId: '6', ten: 'Chi nhánh Quận 3' },
  ];
  const requests: RecordedRequest[] = [];
  const overrides: {
    match: (r: RecordedRequest) => boolean;
    respond: Respond;
    once: boolean;
  }[] = [];

  const view = (account: PatientAccount): Record<string, unknown> => {
    if (isSystem || options.overfull === true) return { ...account };
    return Object.fromEntries(BRANCH_KEYS.map((key) => [key, account[key]]));
  };
  const find = (id: string) => accounts.find((a) => a.taiKhoanId === id);

  function list(request: RecordedRequest): Response {
    const { search } = request;
    if (!isSystem && search.has('khoaNoShow'))
      return apiError(403, 'KHONG_DU_QUYEN');
    const page = Number(search.get('page') ?? '1');
    const pageSize = Number(search.get('pageSize') ?? '20');
    if (!Number.isInteger(page) || page < 1)
      return apiError(400, 'DU_LIEU_KHONG_HOP_LE', [
        { truong: 'page', ma: 'TRANG_KHONG_HOP_LE' },
      ]);
    const roles = search.getAll('vaiTro');
    const status = search.get('trangThai');
    const noShow = search.get('khoaNoShow');
    const text = (search.get('q') ?? '').toLowerCase();
    const matches = accounts.filter((a) => {
      if (roles.length > 0 && !roles.includes(a.loaiTaiKhoan)) return false;
      if (status !== null && a.trangThai !== status) return false;
      if (noShow !== null && a.khoaDatLichDoNoShow !== (noShow === 'true'))
        return false;
      if (text === '') return true;
      return [a.hoTen, a.email, a.soDienThoai].some((value) =>
        value.toLowerCase().includes(text),
      );
    });
    const items = matches
      .slice((page - 1) * pageSize, page * pageSize)
      .map(view);
    return json({ items, total: matches.length, page, pageSize });
  }

  function mutate(id: string, action: string): Response {
    const account = find(id);
    if (account === undefined) return apiError(404, 'KHONG_TIM_THAY');
    // Admin Chi nhánh thấy Bệnh nhân của mình nhưng không có quyền: 403 (PLAN 5.6, TK-15, TK-33)
    if (!isSystem) return apiError(403, 'KHONG_DU_QUYEN');
    if (action === 'lock') {
      if (account.trangThai !== 'DangHoatDong')
        return apiError(409, 'TRANG_THAI_KHONG_PHU_HOP');
      account.trangThai = 'NgungHoatDong';
      return json({
        taiKhoanId: id,
        loaiTaiKhoan: 'BenhNhan',
        trangThai: 'NgungHoatDong',
        soPhienThuHoi: 2,
      });
    }
    if (action === 'unlock') {
      if (account.trangThai !== 'NgungHoatDong')
        return apiError(409, 'TRANG_THAI_KHONG_PHU_HOP');
      account.trangThai = 'DangHoatDong';
      return json({
        taiKhoanId: id,
        loaiTaiKhoan: 'BenhNhan',
        trangThai: 'DangHoatDong',
      });
    }
    if (account.khoaDatLichDoNoShow !== true)
      return apiError(409, 'TRANG_THAI_KHONG_PHU_HOP');
    // Mở khoá no-show chỉ tắt cờ: số lần và trạng thái GIỮ NGUYÊN (B19, Q31)
    account.khoaDatLichDoNoShow = false;
    return json({
      taiKhoanId: id,
      khoaDatLichDoNoShow: false,
      soLanNoShow: account.soLanNoShow,
    });
  }

  function handle(request: RecordedRequest): Response {
    const { method, path } = request;
    if (method === 'GET' && path === '/admin/accounts') return list(request);
    if (method === 'GET' && path === '/admin/system-config')
      return isSystem ? json(config) : apiError(403, 'KHONG_DU_QUYEN');
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
      return account === undefined
        ? apiError(404, 'KHONG_TIM_THAY')
        : json(view(account));
    }
    const action =
      /^\/admin\/accounts\/([^/]+)\/(lock|unlock|unlock-no-show)$/.exec(path);
    if (method === 'POST' && action !== null)
      return mutate(decodeURIComponent(action[1]), action[2]);
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
    // Để test truy cập (khung Admin thật + API xác thực giả) dựng bộ định tuyến `fetch` riêng: dữ liệu tài khoản đi vào đây, còn lại đi vào API xác thực giả
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
    posts: () => requests.filter((r) => r.method === 'POST'),
  };
}

export type FakeApi = ReturnType<typeof installFakeApi>;

/** Một cổng để giữ lời gọi lại cho tới khi test mở (đua, gửi hai lần). Luôn mở trong `finally` để không rò. */
export function makeGate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

export function renderPatientPage(
  options: { scope?: AdminMe; strict?: boolean } = {},
) {
  // Trang có thanh tab (liên kết) nên cần bộ định tuyến (admin F8)
  const page = (
    <MemoryRouter>
      <AdminMeProvider value={options.scope ?? SYSTEM}>
        <PatientAccountsPage />
      </AdminMeProvider>
    </MemoryRouter>
  );
  return render(options.strict ? <StrictMode>{page}</StrictMode> : page);
}

export const rowButton = (name: string) =>
  screen.getByRole('button', { name: `Xem chi tiết ${name}` });

/** Mở panel chi tiết của một Bệnh nhân và chờ panel hiện đủ nội dung (tiêu đề là họ tên). */
export async function openDetail(name: string) {
  fireEvent.click(
    await screen.findByRole('button', { name: `Xem chi tiết ${name}` }),
  );
  return screen.findByRole('dialog', { name });
}
