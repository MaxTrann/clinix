import type { ChatFileKind } from './chat-file-key.js';

// Tên hiển thị của tệp đính kèm (chat B4; PLAN chat 5.8). Tên gốc CHỈ là dữ liệu hiển thị (cột `tep_ten_goc`, header tải xuống), không bao giờ dùng làm khoá lưu.

/** Tên dùng khi tên gốc rỗng sau khi làm sạch (PLAN 5.8). */
export const FALLBACK_FILE_NAME = 'tep-dinh-kem';
/** Cột `tep_ten_goc varchar(255)`: utf8mb4 đếm theo ký tự, tức điểm mã. */
export const FILE_NAME_MAX_CODE_POINTS = 255;

// Ký tự điều khiển (Cc) và ký tự định dạng (Cf: đổi chiều chữ U+202A…U+202E, U+2066…U+2069, U+200E, U+200F, ký tự rộng 0…).
// Bỏ Cf để tên kiểu "anh\u202Efdp.exe" không hiện thành "anhexe.pdf" ở máy người nhận.
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;

/**
 * Làm sạch tên gốc: bỏ phần đường dẫn (cả `/` lẫn `\`), bỏ ký tự điều khiển và định dạng, chuẩn hoá NFC, cắt khoảng trắng và dấu chấm ở hai đầu;
 * đuôi đổi theo loại máy chủ đã nhận ra (ảnh nén sang WebP thì "anh.jpg" thành "anh.webp", quyết định của Trung khi làm chat B4); tối đa 255 điểm mã.
 */
export function cleanFileName(raw: string, kind: ChatFileKind): string {
  const lastSegment = raw.split(/[/\\]/).pop() ?? '';
  const cleaned = lastSegment.replace(INVISIBLE, '').normalize('NFC').trim();
  // Bỏ đuôi cũ (phần sau dấu chấm cuối; tên ".pdf" chỉ có đuôi nên phần tên rỗng), rồi bỏ dấu chấm, khoảng trắng ở hai đầu phần tên
  const dot = cleaned.lastIndexOf('.');
  const base = (dot >= 0 ? cleaned.slice(0, dot) : cleaned).replace(
    /^[\s.]+|[\s.]+$/gu,
    '',
  );
  const suffix = `.${kind}`;
  const room = FILE_NAME_MAX_CODE_POINTS - suffix.length;
  // Cắt theo điểm mã (không cắt đôi emoji ngoài BMP)
  const kept = Array.from(base).slice(0, room).join('').trimEnd();
  return `${kept === '' ? FALLBACK_FILE_NAME : kept}${suffix}`;
}

/**
 * Header `Content-Disposition: attachment` của tải xuống (RFC 6266, RFC 5987): `filename` là bản ASCII thay thế (trình duyệt cũ),
 * `filename*` là tên UTF-8 mã hoá phần trăm (giữ dấu tiếng Việt).
 */
export function attachmentDisposition(name: string): string {
  const ascii = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^\x20-\x7e]|["\\%]/g, '_');
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
