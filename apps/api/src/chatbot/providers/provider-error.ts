import type { ProviderFailure } from './ai-provider.js';

/**
 * Lỗi của một lần gọi nhà cung cấp. Thông điệp CỐ ĐỊNH theo loại hỏng và mã HTTP: không nhận và không bao giờ chứa thân lỗi của nhà cung cấp
 * (thân có thể nhắc lại nội dung câu hỏi hay khoá; HDA-15).
 */
export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderFailure,
    readonly httpStatus?: number,
  ) {
    super(
      httpStatus === undefined
        ? `AI provider failure: ${kind}`
        : `AI provider failure: ${kind} (HTTP ${httpStatus})`,
    );
    this.name = 'ProviderError';
  }
}

/**
 * Mã HTTP ⇒ loại hỏng (PLAN 5.5, T10). Trả `null` với 2xx.
 * 429 ⇒ rateLimited; 5xx ⇒ server; 4xx khác (khoá sai, model đã ngừng, yêu cầu sai) ⇒ rejected;
 * mã lạ (1xx, 3xx, ngoài 100 đến 599) ⇒ badOutput: transport đã cấm chuyển hướng nên không thể là 3xx hợp lệ.
 */
export function failureFromStatus(status: number): ProviderFailure | null {
  if (status >= 200 && status <= 299) return null;
  if (status === 429) return 'rateLimited';
  if (status >= 400 && status <= 499) return 'rejected';
  if (status >= 500 && status <= 599) return 'server';
  return 'badOutput';
}

/** Ném `ProviderError` nếu mã HTTP không phải 2xx. Chỉ nhìn mã, không đọc thân. */
export function throwIfNotSuccess(status: number): void {
  const failure = failureFromStatus(status);
  if (failure !== null) throw new ProviderError(failure, status);
}
