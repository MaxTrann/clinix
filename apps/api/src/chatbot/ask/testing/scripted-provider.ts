import type {
  AiProvider,
  AiRawAnswer,
  AiRequest,
  ProviderName,
} from '../../providers/ai-provider.js';
import { ProviderError } from '../../providers/provider-error.js';

// Provider giả cho e2e của chatbot B3: KHÔNG chạm mạng, đổi được cách trả lời giữa các ca (`handler`), ghi lại mọi yêu cầu nhận được (`requests`) để kiểm
// "chỉ gửi lời nhắc, ngữ cảnh, lịch sử đã che và câu hỏi đã che". Mặc định MỌI lời gọi đều hỏng (để ca nào gọi nhầm lớp này thì thấy rõ qua `calls`).

export type Handler = (request: AiRequest<unknown>) => Promise<AiRawAnswer>;

const DEFAULT_HANDLER: Handler = () =>
  Promise.reject(new ProviderError('server', 500));

export class ScriptedProvider implements AiProvider {
  /** Số lời gọi `generate`. */
  calls = 0;
  /** Số lời gọi đang chờ bên trong `handler` (ca giữ suất đồng thời). */
  entered = 0;
  readonly requests: AiRequest<unknown>[] = [];
  handler: Handler = DEFAULT_HANDLER;

  constructor(
    readonly name: ProviderName,
    public configured = true,
  ) {}

  /** Đưa về trạng thái đầu giữa hai ca. */
  reset(): void {
    this.calls = 0;
    this.entered = 0;
    this.requests.length = 0;
    this.handler = DEFAULT_HANDLER;
    this.configured = true;
  }

  generate(request: AiRequest<unknown>): Promise<AiRawAnswer> {
    this.calls += 1;
    this.requests.push(request);
    return this.handler(request);
  }
}

/** Chuỗi JSON đúng lược đồ của Trợ lý. */
export const modelJson = (
  loai: 'hoiDap' | 'goiYDatLich' | 'ngoaiPhamVi' | 'khanCap',
  traLoi: string,
  chuyenKhoaGoiY: readonly string[] = [],
): string => JSON.stringify({ loai, traLoi, chuyenKhoaGoiY });

/** Handler luôn trả đúng chuỗi JSON này. */
export const replying =
  (text: string): Handler =>
  () =>
    Promise.resolve({ text });

/** Handler hỏng (mọi lần gọi) với một loại hỏng của P1. */
export const failing =
  (
    kind:
      | 'timeout'
      | 'network'
      | 'server'
      | 'rateLimited'
      | 'rejected'
      | 'badOutput',
    status?: number,
  ): Handler =>
  () =>
    Promise.reject(new ProviderError(kind, status));
