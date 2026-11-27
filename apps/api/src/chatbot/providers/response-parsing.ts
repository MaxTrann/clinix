import { ProviderError } from './provider-error.js';

// Đọc phong bì JSON của nhà cung cấp. Không tin hình dạng: sai chỗ nào cũng là `badOutput` (thử lại một lần rồi sang lớp sau).

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `JSON.parse` thân phản hồi thành đối tượng; không phải JSON hay không phải đối tượng thì `badOutput`. */
export function parseEnvelope(bodyText: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new ProviderError('badOutput');
  }
  if (!isRecord(parsed)) throw new ProviderError('badOutput');
  return parsed;
}
