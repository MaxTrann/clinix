import { ProviderError } from './provider-error.js';

// Lớp bọc `fetch` của Node (T4: không SDK của nhà cung cấp). Được TIÊM vào adapter để test không chạm mạng.

export interface HttpRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  /** Thân JSON đã chuỗi hoá. */
  readonly body: string;
}

export interface HttpResponse {
  readonly status: number;
  /** Chỉ có chữ với mã 2xx. Mã khác: luôn rỗng (xem `FetchHttpTransport`). */
  readonly bodyText: string;
}

export interface HttpTransport {
  /** Ném `ProviderError('timeout')` khi `signal` bị huỷ, `ProviderError('network')` với mọi lỗi mạng khác. */
  post(request: HttpRequest, signal: AbortSignal): Promise<HttpResponse>;
}

type FetchFunction = typeof globalThis.fetch;

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

export class FetchHttpTransport implements HttpTransport {
  // Mặc định đọc `globalThis.fetch` LÚC GỌI (không chụp lại lúc dựng) để test thay được `fetch` toàn cục.
  constructor(
    private readonly fetchImpl: FetchFunction = (input, init) =>
      globalThis.fetch(input, init),
  ) {}

  async post(request: HttpRequest, signal: AbortSignal): Promise<HttpResponse> {
    try {
      const response = await this.fetchImpl(request.url, {
        method: 'POST',
        headers: { ...request.headers },
        body: request.body,
        signal,
        // Header khoá không được chuyển sang địa chỉ khác: `Authorization` bị fetch gỡ khi đổi origin nhưng `x-goog-api-key` thì KHÔNG.
        // Hai API không chuyển hướng nên mọi chuyển hướng đều là lỗi.
        redirect: 'error',
      });
      if (!response.ok) {
        // Thân lỗi không bao giờ rời transport (nó có thể nhắc lại câu hỏi hay khoá). Chỉ giải phóng kết nối.
        await response.body?.cancel().catch(() => undefined);
        return { status: response.status, bodyText: '' };
      }
      return { status: response.status, bodyText: await response.text() };
    } catch (error) {
      // Thông điệp lỗi gốc (có thể chứa địa chỉ) cũng bị bỏ: chỉ giữ loại hỏng.
      throw signal.aborted || isAbortError(error)
        ? new ProviderError('timeout')
        : new ProviderError('network');
    }
  }
}
