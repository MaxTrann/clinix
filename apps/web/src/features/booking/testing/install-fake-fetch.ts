import { setApiAuthHooks } from '../../../shared/api/auth-hooks';

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

// Cài `fetch` giả cho test web của booking (F2): mọi lời gọi của `request()` đi vào `fetchImpl`, và có hook xác thực giả để các route của Bệnh nhân
// gắn được access token. `vi` là biến toàn cục của Vitest. KHÔNG gọi backend thật. Gỡ bằng `vi.unstubAllGlobals()` và `setApiAuthHooks(null)`.
export function installFakeFetch(fetchImpl: FetchLike): void {
  setApiAuthHooks({
    getAccessToken: () => 'token-gia',
    recoverFromUnauthorized: async () => false,
  });
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
}
