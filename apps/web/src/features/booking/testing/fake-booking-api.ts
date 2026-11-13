import type { EligibilityResult } from '../api/booking-types';

// API giả của booking cho test web (F3; F4 thêm danh sách người thân và `checks`; F5 thêm `POST /booking/appointments`; F6, F7 thêm đường dẫn của mình). Bọc `fetch` của fake auth
// (`src/test/fake-auth-api.ts`): CHỈ trả lời `GET /api/booking/eligibility`, `GET /api/patient/relatives`, `POST /api/booking/checks` và `POST /api/booking/appointments`, mọi
// đường dẫn khác chuyển cho `delegate`. KHÔNG gọi backend thật. Ghi MỌI lời gọi vào `requests` (kể cả các đường dẫn chuyển đi) để test khẳng định "không giữ chỗ khi chuyển trang":
// không có lời gọi ghi nào tới `/booking/*`. `POST /booking/checks` là POST nhưng CHỈ ĐỌC (B7), nên không tính là lời gọi ghi; `POST /booking/appointments` TẠO lịch (B8), là lời gọi ghi.

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type Override = (init?: RequestInit) => Response | Promise<Response>;

export const ELIGIBLE: EligibilityResult = {
  choPhepDatLich: true,
  soLichHenToiDaMoiHoSo: 3,
};
export const LOCKED: EligibilityResult = {
  choPhepDatLich: false,
  lyDo: 'DAT_LICH_BI_KHOA_NO_SHOW',
  soLichHenToiDaMoiHoSo: 3,
};

// Thân yêu cầu của `POST /booking/checks`
export interface FakeCheckBody {
  khungGioId: string;
  hoSoNguoiThanId: string | null;
}

// Thân yêu cầu của `POST /booking/appointments` (đúng ba khoá; `lyDoKham` giữ nguyên `null` hay chuỗi)
export interface FakeCreateBody extends FakeCheckBody {
  lyDoKham: string | null;
}

// 201 của `POST /booking/appointments` ĐÚNG 7 khoá (B8). Mặc định là lịch cọc > 0 (`ChoThanhToan`, có hạn thanh toán); `makeCreatedDone()` là cọc 0đ (`DaXacNhan` ngay)
export function makeCreatedResult(overrides: Record<string, unknown> = {}) {
  return {
    maLichHen: 'CLX-20261019-7K3M9',
    trangThai: 'ChoThanhToan',
    hanThanhToan: '2026-10-19T03:15:00.000Z',
    giaApDung: '300000.00',
    tienCoc: '100000.00',
    canThanhToan: true,
    thoiGianMayChu: '2026-10-19T03:00:00.000Z',
    ...overrides,
  };
}
export function makeCreatedDone(overrides: Record<string, unknown> = {}) {
  return makeCreatedResult({
    trangThai: 'DaXacNhan',
    hanThanhToan: null,
    tienCoc: '0.00',
    canThanhToan: false,
    ...overrides,
  });
}

// Một phần tử của `GET /patient/relatives` ĐÚNG bảy khoá thật (patient B3: có cả giới tính, ngày sinh, SĐT mà bộ đọc của Bước 4 KHÔNG được chép)
export function makeRelative(overrides: Record<string, unknown> = {}) {
  return {
    hoSoNguoiThanId: '101',
    hoTen: 'Nguyễn Thị Bích',
    moiQuanHe: 'Me',
    gioiTinh: 'Nu',
    ngaySinh: '1960-05-01',
    soDienThoai: '0907654321',
    trangThaiHieuLuc: true,
    ...overrides,
  };
}
export const RELATIVES = {
  items: [
    makeRelative(),
    makeRelative({
      hoSoNguoiThanId: '102',
      hoTen: 'Nguyễn Minh Tuấn',
      moiQuanHe: 'Con',
      gioiTinh: 'Nam',
      ngaySinh: '2015-09-12',
      soDienThoai: null,
    }),
    // Ngừng sử dụng: API vẫn trả, Bước 4 phải ẩn
    makeRelative({
      hoSoNguoiThanId: '103',
      hoTen: 'Nguyễn Văn Cũ',
      moiQuanHe: 'OngBa',
      trangThaiHieuLuc: false,
    }),
  ],
};

// `tomTat` ĐỦ 12 khoá của B7 (kèm giá, cọc, chi nhánh mà Bước 4 KHÔNG được chép); khung giờ 09:00 ngày 20/10/2026 giờ Việt Nam = 02:00 UTC
export function makeCheckResult(tomTat: Record<string, unknown> = {}) {
  return {
    tomTat: {
      dichVu: { ten: 'Tim mạch', thoiLuongPhut: 30 },
      chuyenKhoa: 'Tim mạch',
      bacSi: { hoTen: 'Nguyễn Minh Anh', chucDanh: 'ThS_BS' },
      chiNhanh: {
        ten: 'CLINIX Chi nhánh Quận 3',
        diaChi: '123 Nguyễn Thị Minh Khai',
      },
      thoiGian: '2026-10-20T02:00:00.000Z',
      nguoiKham: { hoTen: 'Nguyễn Văn A', laBanThan: true },
      giaDichVu: '300000.00',
      phuPhi: '0.00',
      giaApDung: '300000.00',
      tienCoc: '100000.00',
      chinhSachHoan: null,
      soDuVi: null,
      ...tomTat,
    },
    thoiGianMayChu: '2026-10-19T03:00:00.000Z',
  };
}

// Phương thức và đường dẫn (bỏ tiền tố `/api`, bỏ query) của một lời gọi `fetch`
function describeRequest(input: RequestInfo | URL, init?: RequestInit) {
  const { pathname } = new URL(String(input), 'http://localhost');
  return {
    method: init?.method ?? 'GET',
    path: pathname.replace(/^\/api/, ''),
  };
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export function createFakeBookingApi(delegate: FetchLike) {
  const overrides: Override[] = [];
  const relativesOverrides: Override[] = [];
  const checkOverrides: Override[] = [];
  const createOverrides: Override[] = [];

  const api = {
    // Thân 200 của `GET /booking/eligibility`; kiểu `unknown` để test đặt cả thân sai hợp đồng
    eligibility: ELIGIBLE as unknown,
    // Thân 200 của `GET /patient/relatives` và `POST /booking/checks`
    relatives: RELATIVES as unknown,
    check: makeCheckResult() as unknown,
    // Trả lời `checks` theo từng hồ sơ: trả `Response` thì dùng nó, trả `undefined` thì dùng `check`
    onCheck: null as
      | ((body: FakeCheckBody) => Response | Promise<Response> | undefined)
      | null,
    requests: [] as { method: string; path: string }[],
    // Thân JSON của từng lần `POST /booking/checks`, theo thứ tự
    checkBodies: [] as FakeCheckBody[],
    // Thân 201 của `POST /booking/appointments` (kiểu `unknown` để test đặt cả thân sai hình dạng); `onCreate` trả lời theo từng thân: trả `Response` thì dùng nó,
    // trả `undefined` thì dùng `created`
    created: makeCreatedResult() as unknown,
    onCreate: null as
      | ((body: FakeCreateBody) => Response | Promise<Response> | undefined)
      | null,
    // Thân JSON của từng lần `POST /booking/appointments`, theo thứ tự (đếm số lần TẠO lịch)
    createBodies: [] as FakeCreateBody[],

    // Lần gọi `eligibility` kế tiếp dùng phản hồi này (có thể ném lỗi mạng hoặc treo)
    failNext(override: Override) {
      overrides.push(override);
    },
    failRelativesNext(override: Override) {
      relativesOverrides.push(override);
    },
    failCheckNext(override: Override) {
      checkOverrides.push(override);
    },
    // Lần gọi tạo lịch kế tiếp dùng phản hồi này (lỗi `maLoi`, ném lỗi mạng, hay treo cho tới khi test cho chạy)
    failCreateNext(override: Override) {
      createOverrides.push(override);
    },
    // Các lời gọi KHÔNG phải GET tới `/booking/*` (giữ chỗ, đặt lịch…); `POST /booking/checks` chỉ đọc nên không tính
    bookingWrites() {
      return api.requests.filter(
        (request) =>
          request.path.startsWith('/booking') &&
          request.method !== 'GET' &&
          request.path !== '/booking/checks',
      );
    },
    count(method: string, path: string) {
      return api.requests.filter(
        (request) => request.method === method && request.path === path,
      ).length;
    },

    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = describeRequest(input, init);
      api.requests.push(request);

      if (request.method === 'GET' && request.path === '/booking/eligibility') {
        const override = overrides.shift();
        if (override) return override(init);
        return jsonResponse(api.eligibility);
      }
      if (request.method === 'GET' && request.path === '/patient/relatives') {
        const override = relativesOverrides.shift();
        if (override) return override(init);
        return jsonResponse(api.relatives);
      }
      if (request.method === 'POST' && request.path === '/booking/checks') {
        const body = JSON.parse(String(init?.body)) as FakeCheckBody;
        api.checkBodies.push(body);
        const override = checkOverrides.shift();
        if (override) return override(init);
        return (await api.onCheck?.(body)) ?? jsonResponse(api.check);
      }
      if (
        request.method === 'POST' &&
        request.path === '/booking/appointments'
      ) {
        const body = JSON.parse(String(init?.body)) as FakeCreateBody;
        api.createBodies.push(body);
        const override = createOverrides.shift();
        if (override) return override(init);
        return (await api.onCreate?.(body)) ?? jsonResponse(api.created, 201);
      }
      return delegate(input, init);
    },
  };
  return api;
}
