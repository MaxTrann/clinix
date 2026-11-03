// API xác thực giả cho test của F1. Mô phỏng đúng hai điều dễ sai nhất: cookie đổi sau mỗi lần xoay, và hai làm mới cùng cookie
// (không xếp hàng) thì bên thua bị coi là dùng lại nên phiên bị thu hồi (TECH_DEBT dòng 11).
export interface FakeAccount {
  vaiTro: string;
  hoTen: string;
  daXacMinhEmail: boolean;
}

type Override = () => Response | Promise<Response>;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const apiError = (status: number, maLoi: string) =>
  json(status, { maLoi, thongBao: 'câu của API' });

export function createFakeAuthApi(
  account: FakeAccount = {
    vaiTro: 'BenhNhan',
    hoTen: 'Bệnh nhân mẫu',
    daXacMinhEmail: true,
  },
) {
  let tokenCounter = 0;
  let codeCounter = 100;
  let resetCounter = 0;
  const validTokens = new Set<string>();
  const overrides = new Map<string, Override[]>();

  const api = {
    cookie: null as number | null,
    revoked: false,
    refreshCalls: 0,
    meCalls: 0,
    logoutCalls: 0,
    inFlightRefresh: 0,
    maxInFlightRefresh: 0,
    // Đặt thành một promise để giữ làm mới ở trạng thái đang bay
    refreshGate: null as Promise<void> | null,
    requests: [] as { path: string; method: string; headers: Headers }[],
    // Thân JSON của từng lần gọi (để kiểm đúng các trường gửi đi); KHÔNG gộp vào `requests` để test cũ giữ nguyên
    bodies: [] as { path: string; body: unknown }[],

    issueToken() {
      const token = `tok-${++tokenCounter}`;
      validTokens.add(token);
      return token;
    },
    startSession() {
      api.cookie = 1;
      api.revoked = false;
    },
    // Mỗi lần gửi mã: id đổi, mã sống 10 phút, 60 giây sau mới được gửi lại
    nextCode() {
      const now = Date.now();
      return {
        maXacThucId: String(++codeCounter),
        hetHanLuc: new Date(now + 600_000).toISOString(),
        coTheGuiLaiLuc: new Date(now + 60_000).toISOString(),
      };
    },
    // Quên mật khẩu (A11): như `nextCode` nhưng KHÔNG có mã lần gửi
    nextForgotCode() {
      const { hetHanLuc, coTheGuiLaiLuc } = api.nextCode();
      return { hetHanLuc, coTheGuiLaiLuc };
    },
    expireTokens() {
      validTokens.clear();
    },
    // Lần gọi kế tiếp tới `path` dùng phản hồi này thay vì xử lý bình thường
    failNext(path: string, override: Override) {
      overrides.set(path, [...(overrides.get(path) ?? []), override]);
    },
    // Giữ lần gọi kế tiếp tới `path` cho tới khi test tự trả phản hồi: để rời trang lúc yêu cầu còn đang bay
    hold(path: string) {
      let release: ((response: Response) => void) | undefined;
      api.failNext(
        path,
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      );
      return (status: number, body: unknown) => {
        if (!release) throw new Error(`Chưa có lần gọi nào tới ${path}`);
        release(json(status, body));
      };
    },

    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
        .replace(/^\/api/, '')
        .split('?')[0];
      const method = init?.method ?? 'GET';
      const headers = new Headers(init?.headers);
      api.requests.push({ path, method, headers });
      if (typeof init?.body === 'string') {
        api.bodies.push({ path, body: JSON.parse(init.body) as unknown });
      }
      if (path === '/auth/refresh') api.refreshCalls += 1;
      if (path === '/auth/me') api.meCalls += 1;
      if (path === '/auth/logout') api.logoutCalls += 1;

      const override = overrides.get(path)?.shift();
      if (override) return override();

      if (path === '/auth/login') {
        api.startSession();
        return json(200, {
          accessToken: api.issueToken(),
          vaiTro: account.vaiTro,
        });
      }
      if (path === '/auth/register') return json(201, api.nextCode());
      if (path === '/auth/register/resend-otp') {
        return json(201, api.nextCode());
      }
      if (path === '/auth/register/verify-otp') {
        return json(200, { daXacMinh: true });
      }
      if (
        path === '/auth/forgot-password' ||
        path === '/auth/forgot-password/resend-otp'
      ) {
        return json(201, api.nextForgotCode());
      }
      if (path === '/auth/forgot-password/verify-otp') {
        return json(200, {
          resetToken: `reset-${++resetCounter}`,
          hetHanLuc: new Date(Date.now() + 600_000).toISOString(),
        });
      }
      if (path === '/auth/reset-password') {
        return json(200, { taiKhoanNgung: false, canDangKyLai: false });
      }
      if (path === '/auth/refresh') return api.handleRefresh();
      if (path === '/auth/logout') {
        api.revoked = true;
        api.cookie = null;
        return new Response(null, { status: 204 });
      }
      return api.handleProtected(path, headers);
    },

    async handleRefresh() {
      if (api.cookie === null) return apiError(401, 'CHUA_DANG_NHAP');
      const sentCookie = api.cookie;
      api.inFlightRefresh += 1;
      api.maxInFlightRefresh = Math.max(
        api.maxInFlightRefresh,
        api.inFlightRefresh,
      );
      await (api.refreshGate ?? Promise.resolve());
      await Promise.resolve();
      api.inFlightRefresh -= 1;
      if (api.revoked || api.cookie !== sentCookie) {
        api.revoked = true;
        api.cookie = null;
        return apiError(401, 'PHIEN_HET_HIEU_LUC');
      }
      api.cookie = sentCookie + 1;
      return json(200, { accessToken: api.issueToken() });
    },

    // Treo cho tới khi request bị huỷ: dùng cho path chỉ định qua failNext
    hang(init?: RequestInit) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Đã huỷ', 'AbortError'));
        });
      });
    },

    handleProtected(path: string, headers: Headers) {
      const authorization = headers.get('Authorization');
      if (authorization === null) return apiError(401, 'CHUA_DANG_NHAP');
      if (api.revoked) return apiError(401, 'PHIEN_HET_HIEU_LUC');
      if (!validTokens.has(authorization.replace('Bearer ', ''))) {
        return apiError(401, 'TOKEN_KHONG_HOP_LE');
      }
      if (path === '/auth/me') return json(200, account);
      if (path === '/admin/me') return json(200, { phamVi: 'ToanHeThong' });
      return json(200, { ok: true });
    },
  };
  return api;
}

// Web Locks giả: một khoá, hàng đợi FIFO, có thể chia sẻ giữa nhiều "tab" giả. Chờ khoá huỷ được bằng `signal`.
export function createFakeLocks() {
  let holding = false;
  const queue: (() => void)[] = [];
  const locks = {
    names: [] as string[],
    requests: 0,
    request<T>(
      name: string,
      options: { signal?: AbortSignal },
      callback: () => Promise<T>,
    ): Promise<T> {
      locks.names.push(name);
      locks.requests += 1;
      return new Promise<T>((resolve, reject) => {
        const run = () => {
          holding = true;
          options.signal?.removeEventListener('abort', onAbort);
          callback()
            .then(resolve, reject)
            .finally(() => {
              holding = false;
              queue.shift()?.();
            });
        };
        const onAbort = () => {
          queue.splice(queue.indexOf(run), 1);
          reject(new DOMException('Đã huỷ', 'AbortError'));
        };
        if (!holding) return run();
        options.signal?.addEventListener('abort', onAbort);
        queue.push(run);
      });
    },
  };
  return locks;
}
