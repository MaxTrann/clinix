import type {
  HttpRequest,
  HttpResponse,
  HttpTransport,
} from '../providers/http-transport.js';
import { ProviderError } from '../providers/provider-error.js';

/** Một câu trả lời trong kịch bản: phản hồi HTTP, hay lỗi mà transport thật sẽ ném. */
export type FakeReply = HttpResponse | ProviderError;

/**
 * Transport giả: KHÔNG chạm mạng, ghi lại mọi yêu cầu (`url`, `headers`, `body`) và `signal` để test so với fixture.
 */
export class FakeHttpTransport implements HttpTransport {
  readonly requests: HttpRequest[] = [];
  readonly signals: AbortSignal[] = [];

  constructor(private readonly replies: FakeReply[] = []) {}

  post(request: HttpRequest, signal: AbortSignal): Promise<HttpResponse> {
    this.requests.push(request);
    this.signals.push(signal);
    const reply = this.replies.shift();
    if (reply === undefined) {
      return Promise.reject(new Error('FakeHttpTransport: hết kịch bản'));
    }
    return reply instanceof ProviderError
      ? Promise.reject(reply)
      : Promise.resolve(reply);
  }
}

/** Phản hồi HTTP của nhà cung cấp. Với mã không phải 2xx, `FetchHttpTransport` thật luôn trả thân rỗng; ở đây thân được GIỮ để test chứng minh adapter không dùng nó. */
export const reply = (status: number, bodyText: string): HttpResponse => ({
  status,
  bodyText,
});
