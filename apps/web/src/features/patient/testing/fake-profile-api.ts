import { apiError } from '../../../test/fake-auth-api';

// Hàm giả GET và PUT /api/profile và GET, POST, PUT /api/patient/relatives cho test (patient F3, F6; TRACKING F3-G, F3-H, F6-B).
// Bọc `fetch` của fake auth và CHỈ chặn hai đường dẫn đó; mọi đường dẫn khác chuyển cho fake auth. Fake auth trả `{ ok: true }`
// (hoặc 401 nếu không token) cho đường dẫn lạ, nên mọi test mở trang "Hồ sơ người khám" cần hàm này: nó trả `{ items: [] }` cho
// danh sách người thân khi test không nêu dữ liệu. Lời gọi người thân ghi RIÊNG (`api.relatives`), không lẫn vào `api.requests` và
// `count()` của hồ sơ. Dữ liệu giả đuôi `.invalid`, không dữ liệu thật.

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type Method = 'GET' | 'PUT';
type RelativeMethod = 'GET' | 'POST' | 'PUT';
type Override = (init?: RequestInit) => Response | Promise<Response>;

// Đúng 10 khoá của GET /profile (PLAN 5.7)
export interface FakeProfileData {
  hoTen: string;
  email: string;
  soDienThoai: string;
  gioiTinh: string | null;
  ngaySinh: string | null;
  diaChi: string | null;
  anhDaiDien: null;
  vaiTro: string;
  chiNhanh: null;
  phamViQuanTri: null;
}

export const SAMPLE_PROFILE: FakeProfileData = {
  hoTen: 'Nguyễn Văn A',
  email: 'nguyenvana@example.invalid',
  soDienThoai: '0901234567',
  gioiTinh: 'Nam',
  ngaySinh: '1990-05-15',
  diaChi: '12 Đường Mẫu, Quận Một',
  anhDaiDien: null,
  vaiTro: 'BenhNhan',
  chiNhanh: null,
  phamViQuanTri: null,
};

// Đúng bảy khoá của một phần tử GET /patient/relatives (PLAN 5.7)
export interface FakeRelative {
  hoSoNguoiThanId: string;
  hoTen: string;
  moiQuanHe: string;
  gioiTinh: string;
  ngaySinh: string;
  soDienThoai: string | null;
  trangThaiHieuLuc: boolean;
}

// Hai hồ sơ của frame `416:2` (dữ liệu giả)
export const SAMPLE_RELATIVES: FakeRelative[] = [
  {
    hoSoNguoiThanId: '1',
    hoTen: 'Nguyễn Thị Bích',
    moiQuanHe: 'Me',
    gioiTinh: 'Nu',
    ngaySinh: '1960-03-08',
    soDienThoai: '0909123456',
    trangThaiHieuLuc: true,
  },
  {
    hoSoNguoiThanId: '2',
    hoTen: 'Nguyễn Minh Tuấn',
    moiQuanHe: 'Con',
    gioiTinh: 'Nam',
    ngaySinh: '2015-07-20',
    soDienThoai: null,
    trangThaiHieuLuc: true,
  },
];

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Treo cho tới khi yêu cầu bị huỷ (dùng với đồng hồ giả để tạo TimeoutError, hoặc để thử đăng xuất giữa chừng)
export function hang(init?: RequestInit): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(new DOMException('Đã huỷ', 'AbortError'));
    });
  });
}

const RELATIVES_PATH = '/api/patient/relatives';

// SĐT như API: bỏ dấu cách và dấu chấm; null, rỗng hoặc chỉ khoảng trắng ⇒ null
function normalizedPhone(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  return value.replace(/[ .]/g, '');
}

export function createFakeProfileApi(
  delegate: FetchLike,
  initial: Partial<FakeProfileData> = {},
  initialRelatives: FakeRelative[] = [],
) {
  const overrides: Record<Method, Override[]> = { GET: [], PUT: [] };
  const relativeOverrides: Record<RelativeMethod, Override[]> = {
    GET: [],
    POST: [],
    PUT: [],
  };

  // Giữ lần gọi kế tiếp cho tới khi test tự trả phản hồi
  function holder(failNext: (override: Override) => void) {
    let release!: (response: Response) => void;
    failNext(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    return (status: number, body: unknown) => release(json(status, body));
  }

  const api = {
    profile: { ...SAMPLE_PROFILE, ...initial } as FakeProfileData,
    requests: [] as { method: Method; headers: Headers; body: unknown }[],

    count(method: Method): number {
      return api.requests.filter((request) => request.method === method).length;
    },
    // Lần gọi kế tiếp tới đường dẫn hồ sơ bằng `method` dùng phản hồi này
    failNext(method: Method, override: Override) {
      overrides[method].push(override);
    },
    hold(method: Method) {
      return holder((override) => api.failNext(method, override));
    },

    // GET, POST, PUT /api/patient/relatives(/:id): lưu ở bộ nhớ, trả như API (POST 201 và PUT 200 trả hồ sơ; PUT 404 nếu không có,
    // 409 nếu đã ngừng). GET trả đúng thứ tự `items` (test tự đặt thứ tự lộn xộn để kiểm web sắp lại).
    relatives: {
      items: initialRelatives.map((relative) => ({ ...relative })),
      requests: [] as {
        method: RelativeMethod;
        path: string;
        headers: Headers;
        body: Record<string, unknown>;
      }[],
      count(method: RelativeMethod): number {
        return api.relatives.requests.filter(
          (request) => request.method === method,
        ).length;
      },
      failNext(method: RelativeMethod, override: Override) {
        relativeOverrides[method].push(override);
      },
      hold(method: RelativeMethod) {
        return holder((override) => api.relatives.failNext(method, override));
      },
    },

    fetch: async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const path = String(input).split('?')[0];
      if (path === RELATIVES_PATH || path.startsWith(`${RELATIVES_PATH}/`)) {
        return api.handleRelatives(path, init);
      }
      if (path !== '/api/profile') {
        return delegate(input, init);
      }
      const method = (init?.method ?? 'GET') as Method;
      const body: Record<string, unknown> =
        typeof init?.body === 'string' ? JSON.parse(init.body) : {};
      api.requests.push({ method, headers: new Headers(init?.headers), body });

      const override = overrides[method].shift();
      if (override) return override(init);

      if (method === 'PUT') {
        // Như API: ghi năm cột, SĐT chuẩn hoá thành 10 số liền, rồi trả hồ sơ ĐỌC LẠI
        api.profile = {
          ...api.profile,
          hoTen: body.hoTen as string,
          soDienThoai: String(body.soDienThoai).replace(/[ .]/g, ''),
          gioiTinh: body.gioiTinh as string | null,
          ngaySinh: body.ngaySinh as string | null,
          diaChi: body.diaChi as string | null,
        };
      }
      return json(200, api.profile);
    },

    async handleRelatives(path: string, init?: RequestInit): Promise<Response> {
      const method = (init?.method ?? 'GET') as RelativeMethod;
      const body: Record<string, unknown> =
        typeof init?.body === 'string' ? JSON.parse(init.body) : {};
      api.relatives.requests.push({
        method,
        path,
        headers: new Headers(init?.headers),
        body,
      });

      const override = relativeOverrides[method].shift();
      if (override) return override(init);

      const { items } = api.relatives;
      if (method === 'GET') return json(200, { items });

      const fields = {
        hoTen: body.hoTen as string,
        moiQuanHe: body.moiQuanHe as string,
        gioiTinh: body.gioiTinh as string,
        ngaySinh: body.ngaySinh as string,
        soDienThoai: normalizedPhone(body.soDienThoai),
      };
      if (method === 'POST') {
        const largest = items.reduce(
          (max, item) =>
            BigInt(item.hoSoNguoiThanId) > max
              ? BigInt(item.hoSoNguoiThanId)
              : max,
          0n,
        );
        const created: FakeRelative = {
          hoSoNguoiThanId: String(largest + 1n),
          ...fields,
          trangThaiHieuLuc: true,
        };
        items.push(created);
        return json(201, created);
      }
      const found = items.find(
        (item) =>
          item.hoSoNguoiThanId === path.slice(RELATIVES_PATH.length + 1),
      );
      if (!found) return apiError(404, 'KHONG_TIM_THAY');
      if (!found.trangThaiHieuLuc) {
        return apiError(409, 'HO_SO_NGUOI_THAN_DA_NGUNG');
      }
      Object.assign(found, fields);
      return json(200, found);
    },
  };
  return api;
}
