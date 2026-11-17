import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { vi } from 'vitest';
import { resetAuthForTest } from '../features/auth/auth-session';
import { setAuthState } from '../features/auth/auth-store';
import type { AuthUser } from '../features/auth';
import { setApiAuthHooks } from '../shared/api/auth-hooks';
import { ADMIN_DEPOSIT_POLICY_PATH } from '../shared/routes/wallet-paths';
import { createFakeAuthApi } from '../test/fake-auth-api';
import { createAppRoutes } from './routes';

// Dựng màn "Đặt cọc & Hoàn tiền" (payment F5) bằng ROUTER THẬT: khung `AdminLayout` (đọc `/admin/me`), `AdminScopeGuard`, `RequireAuth`, `lazy`. Đặt ở `router/` (nếp `admin-appointments-harness.tsx`
// của booking) vì cần `features/auth` sâu và `createAppRoutes`. API giả: `/admin/me` trả `api.scope`; ba API chính sách của B10; đường dẫn khác chuyển cho fake auth. KHÔNG gọi backend thật. Dữ liệu giả.

export interface FakeTier {
  soGioTruocToiThieu: number;
  tyLeHoan: number;
}
export interface FakePolicy {
  dichVuKhamId: string;
  mucDatCoc: string;
  moc: FakeTier[];
}
export interface FakeRequest {
  method: string;
  path: string;
  body?: unknown;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const SYSTEM_SCOPE = { phamVi: 'ToanHeThong' } as const;
export const BRANCH_SCOPE = {
  phamVi: 'ChiNhanh',
  chiNhanh: { id: '3', ten: 'CLINIX Chi nhánh Quận 3' },
} as const;

const POLICY_PREFIX = '/admin/payment-policy/services';

export function createFakePolicyApi(
  delegate: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  const api = {
    scope: SYSTEM_SCOPE as unknown,
    groups: [
      {
        nhomDichVuId: '1',
        ten: 'Khám theo chuyên khoa',
        dichVu: [
          {
            dichVuKhamId: '7',
            ten: 'Tim mạch',
            giaMacDinh: '300000.00',
            mucDatCoc: '0.00',
            coChinhSachRieng: false,
          },
          {
            dichVuKhamId: '8',
            ten: 'Cơ Xương Khớp',
            giaMacDinh: '350000.00',
            mucDatCoc: '100000.00',
            coChinhSachRieng: true,
          },
        ],
      },
      {
        nhomDichVuId: '2',
        ten: 'Khám tổng quát',
        dichVu: [
          {
            dichVuKhamId: '9',
            ten: 'Khám tổng quát cơ bản',
            giaMacDinh: '500000.00',
            mucDatCoc: '0.00',
            coChinhSachRieng: false,
          },
        ],
      },
    ] as unknown,
    policies: {
      '7': { dichVuKhamId: '7', mucDatCoc: '0.00', moc: [] },
      '8': {
        dichVuKhamId: '8',
        mucDatCoc: '100000.00',
        moc: [
          { soGioTruocToiThieu: 24, tyLeHoan: 100 },
          { soGioTruocToiThieu: 2, tyLeHoan: 50 },
        ],
      },
      '9': { dichVuKhamId: '9', mucDatCoc: '0.00', moc: [] },
    } as Record<string, FakePolicy>,
    requests: [] as FakeRequest[],
    /** Ghi đè phản hồi kế tiếp của danh sách, chi tiết, hay PUT (một lần mỗi phần tử) */
    next: {
      list: [] as (() => Promise<Response> | Response)[],
      detail: [] as (() => Promise<Response> | Response)[],
      put: [] as ((body: unknown) => Promise<Response> | Response)[],
    },
    puts() {
      return api.requests.filter((request) => request.method === 'PUT');
    },
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const path = url.pathname.replace(/^\/api/, '');
      const method = init?.method ?? 'GET';
      const body =
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as unknown)
          : undefined;
      if (path === '/admin/me') return json(api.scope);
      if (!path.startsWith(POLICY_PREFIX)) return delegate(input, init);
      api.requests.push({ method, path, body });

      if (path === POLICY_PREFIX) {
        const override = api.next.list.shift();
        return override ? override() : json({ nhom: api.groups });
      }
      const id = decodeURIComponent(path.slice(POLICY_PREFIX.length + 1));
      if (method === 'PUT') {
        const override = api.next.put.shift();
        if (override) return override(body);
        const input = body as { mucDatCoc: string; moc: FakeTier[] };
        const saved: FakePolicy = {
          dichVuKhamId: id,
          mucDatCoc: `${input.mucDatCoc}.00`,
          moc: [...input.moc].sort(
            (a, b) => b.soGioTruocToiThieu - a.soGioTruocToiThieu,
          ),
        };
        api.policies[id] = saved;
        return json(saved);
      }
      const override = api.next.detail.shift();
      if (override) return override();
      const policy = api.policies[id];
      return policy === undefined
        ? json({ maLoi: 'KHONG_TIM_THAY', thongBao: 'Không tìm thấy' }, 404)
        : json(policy);
    },
  };
  return api;
}

export function renderDepositPolicy(
  options: {
    path?: string;
    before?: (api: ReturnType<typeof createFakePolicyApi>) => void;
  } = {},
) {
  resetAuthForTest();
  const user: AuthUser = {
    vaiTro: 'QuanTriVien',
    hoTen: 'Admin CLINIX',
    daXacMinhEmail: true,
  };
  setAuthState({ status: 'authenticated', user });
  setApiAuthHooks({
    getAccessToken: () => 'token-gia',
    recoverFromUnauthorized: async () => false,
  });
  const auth = createFakeAuthApi();
  const api = createFakePolicyApi(auth.fetch);
  options.before?.(api);
  vi.stubGlobal('fetch', vi.fn(api.fetch));
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: ['/', options.path ?? ADMIN_DEPOSIT_POLICY_PATH],
    initialIndex: 1,
  });
  const view = render(<RouterProvider router={router} />);
  return { api, router, ...view };
}

export function cleanUpDepositPolicy() {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setApiAuthHooks(null);
}

/** Một phản hồi treo tới khi test gọi `release` (để thấy trạng thái đang tải hay đang gửi). */
export function deferred() {
  let release!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => {
    release = resolve;
  });
  return { promise, release, json };
}
