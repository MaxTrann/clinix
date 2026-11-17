import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeEach, vi } from 'vitest';
import { createAppRoutes } from '../../../../../router/routes';
import { createFakeAuthApi } from '../../../../../test/fake-auth-api';
import type { AdminMe } from '../../../../admin';
import {
  resetAuthForTest,
  restoreSession,
} from '../../../../auth/auth-session';
import type { ReceptionDoctor } from '../../../api/reception-api';
import { jsonResponse } from '../../../testing/fetch-routing';
import type {
  AdminReviewDetail,
  AdminReviewItem,
} from '../../api/admin-review-types';
import { ADMIN_REVIEWS_PATH } from '../reviews-paths';

// Dựng trang "Kiểm duyệt đánh giá" cho test mức trang (doctor-exam F7; WKD-01…WKD-10): app thật qua `createAppRoutes()` (khung Admin, thanh bên, `AdminScopeGuard`), `fetch` giả theo hợp đồng B7 và `GET /admin/doctor-shifts/doctors`.
// Dữ liệu giả, không phải của ai.
export const Q3 = { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Quận 3' };
export const Q7 = { chiNhanhId: '2', ten: 'CLINIX Chi nhánh Quận 7' };
export const BRANCH_ADMIN: AdminMe = {
  phamVi: 'ChiNhanh',
  chiNhanh: { id: '1', ten: Q3.ten },
};

export const DOCTORS: ReceptionDoctor[] = [
  {
    bacSiId: '11',
    hoTen: 'Nguyễn Minh Anh',
    ngungHoatDong: false,
    chiNhanh: Q3,
    chuyenKhoa: { chuyenKhoaId: '5', ten: 'Tim mạch' },
  },
  {
    bacSiId: '12',
    hoTen: 'Lê Thảo Vy',
    ngungHoatDong: false,
    chiNhanh: Q7,
    chuyenKhoa: { chuyenKhoaId: '6', ten: 'Nhi khoa' },
  },
];

// Một dòng danh sách (tám khoá)
export function item(
  overrides: Partial<AdminReviewItem> = {},
): AdminReviewItem {
  return {
    danhGiaId: '1',
    bacSi: { bacSiId: '11', hoTen: 'Nguyễn Minh Anh' },
    chiNhanh: Q3,
    nguoiDanhGia: { hoTen: 'Vũ Thị F' },
    soSao: 4,
    nhanXet: 'Tốt, sẽ giới thiệu cho bạn bè. Bác sĩ có chuyên môn cao.',
    thoiDiemTao: '2026-05-28T03:00:00.000Z',
    biAn: false,
    ...overrides,
  };
}

// Thân JSON của chi tiết đúng như máy chủ: khoá `lyDoAn` VẮNG khi `null`
export function detailBody(
  overrides: Partial<AdminReviewDetail> = {},
): Record<string, unknown> {
  const { lyDoAn, ...rest } = {
    ...item(),
    maLichHen: 'CLX-20260611-00006',
    thoiGianKham: '2026-06-11T02:30:00.000Z',
    lyDoAn: null as string | null,
    ...overrides,
  };
  return lyDoAn === null ? rest : { ...rest, lyDoAn };
}

export const ITEMS: AdminReviewItem[] = [
  item({ danhGiaId: '1' }),
  item({
    danhGiaId: '2',
    nguoiDanhGia: { hoTen: 'Đỗ Văn G' },
    soSao: 5,
    nhanXet: 'Rất tận tâm.',
    thoiDiemTao: '2026-05-27T03:00:00.000Z',
  }),
  item({
    danhGiaId: '3',
    bacSi: { bacSiId: '12', hoTen: 'Lê Thảo Vy' },
    chiNhanh: Q7,
    nguoiDanhGia: { hoTen: 'Lê Văn C' },
    soSao: 1,
    nhanXet: 'Bác sĩ này hoàn toàn vô đạo đức!!!',
    thoiDiemTao: '2026-05-15T03:00:00.000Z',
    biAn: true,
  }),
];

export function pageBody(
  items: AdminReviewItem[] = ITEMS,
  overrides: {
    total?: number;
    page?: number;
    counts?: { HienThi: number; DaAn: number };
  } = {},
): Record<string, unknown> {
  return {
    items,
    total: overrides.total ?? items.length,
    page: overrides.page ?? 1,
    pageSize: 20,
    demTheoTrangThai: overrides.counts ?? {
      HienThi: items.filter((row) => !row.biAn).length,
      DaAn: items.filter((row) => row.biAn).length,
    },
  };
}

type Reply = Response | Promise<Response>;

// Trả lời bị huỷ khi yêu cầu bị huỷ (như `fetch` thật), để ca "huỷ yêu cầu cũ" và "hết giờ" chạy đúng
function abortable(
  reply: Reply,
  signal?: AbortSignal | null,
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    void Promise.resolve(reply).then(resolve, reject);
  });
}

export function setupReviewsHarness() {
  const fetchMock = vi.fn<typeof fetch>();
  const handlers: {
    list: (url: URL) => Reply;
    detail: (id: string, url: URL) => Reply;
    // `POST /admin/doctor-ratings/:id/hide` (F8): `body` là thân JSON đã đọc ra
    hide: (id: string, body: unknown) => Reply;
    doctors: () => Reply;
  } = {
    list: () => jsonResponse(pageBody()),
    detail: (id) => jsonResponse(detailBody({ danhGiaId: id })),
    hide: (id) => jsonResponse({ danhGiaId: id, biAn: true }),
    doctors: () =>
      jsonResponse({
        items: DOCTORS,
        total: DOCTORS.length,
        page: 1,
        pageSize: 100,
      }),
  };
  let scope: AdminMe = { phamVi: 'ToanHeThong' };
  let api: ReturnType<typeof createFakeAuthApi> | undefined;

  beforeEach(() => {
    resetAuthForTest();
    handlers.list = () => jsonResponse(pageBody());
    handlers.detail = (id) => jsonResponse(detailBody({ danhGiaId: id }));
    handlers.hide = (id) => jsonResponse({ danhGiaId: id, biAn: true });
    handlers.doctors = () =>
      jsonResponse({
        items: DOCTORS,
        total: DOCTORS.length,
        page: 1,
        pageSize: 100,
      });
    fetchMock.mockReset();
    fetchMock.mockImplementation((input, init) => {
      const url = new URL(String(input), 'http://localhost');
      const detail = /\/admin\/doctor-ratings\/([^/]+)$/.exec(url.pathname);
      const hide = /\/admin\/doctor-ratings\/([^/]+)\/hide$/.exec(url.pathname);
      if (url.pathname.endsWith('/admin/me'))
        return Promise.resolve(jsonResponse(scope));
      if (hide !== null && init?.method === 'POST')
        return abortable(
          handlers.hide(
            decodeURIComponent(hide[1]),
            JSON.parse(String(init.body)),
          ),
          init.signal,
        );
      if (url.pathname.endsWith('/admin/doctor-shifts/doctors'))
        return abortable(handlers.doctors(), init?.signal);
      if (detail !== null)
        return abortable(
          handlers.detail(decodeURIComponent(detail[1]), url),
          init?.signal,
        );
      if (url.pathname.endsWith('/admin/doctor-ratings'))
        return abortable(handlers.list(url), init?.signal);
      return (api as NonNullable<typeof api>).fetch(input, init);
    });
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  async function renderPage(
    options: {
      scope?: AdminMe;
      path?: string;
      vaiTro?: string;
      // Khách chưa đăng nhập (không có phiên)
      guest?: boolean;
    } = {},
  ) {
    scope = options.scope ?? { phamVi: 'ToanHeThong' };
    api = createFakeAuthApi({
      vaiTro: options.vaiTro ?? 'QuanTriVien',
      hoTen: 'Admin CLINIX',
      daXacMinhEmail: true,
    });
    if (options.guest !== true) api.startSession();
    await restoreSession();
    const router = createMemoryRouter(createAppRoutes(), {
      initialEntries: [options.path ?? ADMIN_REVIEWS_PATH],
    });
    render(<RouterProvider router={router} />);
    return router;
  }

  // Các lời gọi đã gửi tới một đường dẫn (kết thúc bằng `pathEnd`), theo thứ tự
  function callsTo(pathEnd: string, method = 'GET'): URL[] {
    return fetchMock.mock.calls
      .filter(([, init]) => (init?.method ?? 'GET') === method)
      .map(([input]) => new URL(String(input), 'http://localhost'))
      .filter((url) => url.pathname.endsWith(pathEnd));
  }
  const listCalls = () => callsTo('/admin/doctor-ratings');
  const detailCalls = () =>
    fetchMock.mock.calls
      .map(([input]) => new URL(String(input), 'http://localhost'))
      .filter((url) => /\/admin\/doctor-ratings\/[^/]+$/.test(url.pathname));
  const writeCalls = () =>
    fetchMock.mock.calls.filter(
      ([input, init]) =>
        String(input).includes('/admin/doctor-ratings') &&
        (init?.method ?? 'GET') !== 'GET',
    );
  // Các `POST …/hide` đã gửi: đường dẫn và thân JSON đã đọc ra, theo thứ tự
  const hideCalls = () =>
    writeCalls().map(([input, init]) => ({
      pathname: new URL(String(input), 'http://localhost').pathname,
      method: init?.method,
      body: JSON.parse(String(init?.body)) as unknown,
    }));

  return {
    handlers,
    fetchMock,
    renderPage,
    callsTo,
    listCalls,
    detailCalls,
    writeCalls,
    hideCalls,
  };
}
