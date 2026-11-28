import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * article B2 (T10, MH13): route CÔNG KHAI của bài viết dùng `Cache-Control: no-cache` (luôn hỏi lại máy chủ, vẫn cho 304) để bài vừa ẩn không còn hiện ở lần xem kế.
 * Đặt bằng middleware (như `noStore` của route quản trị) nên mọi phản hồi của controller đều có: 200, 400 và cả 404.
 * Kiểu của Node (không import `express`): test kiến trúc của article chỉ cho import gói Nest, TypeORM, class-validator, class-transformer và `node:`.
 */
export function noCache(
  _req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  res.setHeader('Cache-Control', 'no-cache');
  next();
}
