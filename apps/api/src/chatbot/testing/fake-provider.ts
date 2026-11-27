import type {
  AiProvider,
  AiRawAnswer,
  AiRequest,
  ProviderFailure,
  ProviderName,
} from '../providers/ai-provider.js';
import { ProviderError } from '../providers/provider-error.js';

/** Một bước của kịch bản: trả chữ, hỏng với một loại, hay treo mãi (kể cả khi bị huỷ: thử trường hợp xấu nhất). */
export type FakeStep =
  | { readonly kind: 'ok'; readonly text: string }
  | {
      readonly kind: 'fail';
      readonly failure: ProviderFailure;
      readonly httpStatus?: number;
    }
  | { readonly kind: 'hang' }
  | { readonly kind: 'throw'; readonly error: unknown };

export const ok = (text: string): FakeStep => ({ kind: 'ok', text });
export const fail = (
  failure: ProviderFailure,
  httpStatus?: number,
): FakeStep =>
  httpStatus === undefined
    ? { kind: 'fail', failure }
    : { kind: 'fail', failure, httpStatus };
export const hang = (): FakeStep => ({ kind: 'hang' });
export const throws = (error: unknown): FakeStep => ({ kind: 'throw', error });

/**
 * Provider giả cho test (không bao giờ chạm mạng). Mỗi lời gọi lấy một bước từ kịch bản; hết kịch bản thì dùng `whenExhausted`
 * (mặc định: lỗi 500) để ca nào gọi nhiều hơn dự kiến thì đỏ rõ ràng.
 */
export class FakeProvider implements AiProvider {
  /** Số lời gọi `generate`. */
  calls = 0;
  /** `signal` của từng lời gọi (kiểm "đã bị huỷ sau hạn chót"). */
  readonly signals: AbortSignal[] = [];
  readonly requests: AiRequest<unknown>[] = [];

  constructor(
    readonly name: ProviderName,
    private readonly script: FakeStep[] = [],
    readonly configured = true,
    private readonly whenExhausted: FakeStep = fail('server', 500),
  ) {}

  generate(
    request: AiRequest<unknown>,
    signal: AbortSignal,
  ): Promise<AiRawAnswer> {
    this.calls += 1;
    this.signals.push(signal);
    this.requests.push(request);
    const step = this.script.shift() ?? this.whenExhausted;
    switch (step.kind) {
      case 'ok':
        return Promise.resolve({ text: step.text });
      case 'fail':
        return Promise.reject(new ProviderError(step.failure, step.httpStatus));
      case 'throw':
        return Promise.reject(
          step.error instanceof Error ? step.error : new Error('lỗi giả'),
        );
      case 'hang':
        return new Promise<AiRawAnswer>(() => undefined);
    }
  }
}
