// Hàm giả GET và PUT /api/profile cho test (patient F3; TRACKING F3-G, F3-H). Bọc `fetch` của fake auth và CHỈ chặn đường dẫn hồ sơ;
// mọi đường dẫn khác chuyển cho fake auth. Fake auth trả `{ ok: true }` (hoặc 401 nếu không token) cho `/profile`, nên mọi test
// mở trang "Hồ sơ người khám" cần hàm này. Dữ liệu giả đuôi `.invalid`, không dữ liệu thật.

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type Method = 'GET' | 'PUT';
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

export function createFakeProfileApi(
  delegate: FetchLike,
  initial: Partial<FakeProfileData> = {},
) {
  const overrides: Record<Method, Override[]> = { GET: [], PUT: [] };

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
    // Giữ lần gọi kế tiếp cho tới khi test tự trả phản hồi
    hold(method: Method) {
      let release!: (response: Response) => void;
      api.failNext(
        method,
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      );
      return (status: number, body: unknown) => release(json(status, body));
    },

    fetch: async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      if (String(input).split('?')[0] !== '/api/profile') {
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
  };
  return api;
}
