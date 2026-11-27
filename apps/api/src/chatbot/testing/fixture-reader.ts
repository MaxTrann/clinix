import { readFileSync } from 'node:fs';

/** Đọc một file trong `testing/fixtures/` (ví dụ `groq/request.json`). Fixture tự viết theo tài liệu, xem `fixtures/NGUON.md`. */
export function readFixture(path: string): string {
  return readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8');
}

export function readJsonFixture(path: string): unknown {
  return JSON.parse(readFixture(path));
}

/**
 * Chuỗi đánh dấu nằm trong mọi thân lỗi mẫu: nếu nó xuất hiện trong thông điệp lỗi hay log thì thân lỗi đã rò (HDA-15).
 */
export const ERROR_BODY_MARKER = 'THAN-LOI-KHONG-DUOC-RO';
