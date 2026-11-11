import { BOOKING_PATH } from '../../shared/routes/booking-paths';
import { textFrom } from './route-state';
import { homePathFor, type VaiTro } from './roles';

// Quay lại đúng trang sau khi đăng nhập (booking F3, Q39, M10). `RequireAuth` ghi đường dẫn đang mở vào `location.state.from`;
// các trang đăng nhập đọc lại ở đây. `from` đi bằng state của router (không query, không storage): nó chỉ là đường dẫn và id
// khung giờ, không phải bí mật, nhưng mọi nơi đọc đều phải kiểm vì state có thể do trang khác đặt hoặc cũ từ lịch sử trình duyệt.
export const RETURN_TO_KEY = 'from';

const MAX_LENGTH = 2048;
// Tên miền giả chỉ để `URL` chuẩn hoá đường dẫn và để so origin; không bao giờ được dùng làm đích chuyển hướng
const PROBE_ORIGIN = 'http://return-to.invalid';
// Ký tự điều khiển và khoảng trắng (mã ≤ 0x20, và 0x7f): trình duyệt bỏ tab, xuống dòng khi phân tích URL nên `/<tab>/evil.com`
// thành `//evil.com`. Dấu `\`: trình duyệt coi như `/`, nên `/\evil.com` là `//evil.com`.
function hasForbiddenChar(raw: string): boolean {
  for (const char of raw) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f || char === '\\') return true;
  }
  return false;
}

// Luật cấu trúc của một đường dẫn nội bộ: không rỗng, không quá dài, bắt đầu bằng `/` mà ký tự thứ hai không phải `/` hay `\`
// (nếu không là địa chỉ cùng giao thức `//evil.com`), không có ký tự cấm, và sau khi `URL` phân tích vẫn cùng origin.
function isInternalPath(path: string): boolean {
  if (path.length === 0 || path.length > MAX_LENGTH) return false;
  if (path[0] !== '/' || path[1] === '/' || path[1] === '\\') return false;
  if (hasForbiddenChar(path)) return false;
  try {
    return new URL(path, PROBE_ORIGIN).origin === PROBE_ORIGIN;
  } catch {
    return false;
  }
}

// Đường dẫn nội bộ đã chuẩn hoá (`pathname + search + hash`), hoặc null. Chống mở chuyển hướng. Trả bản ĐÃ CHUẨN HOÁ để
// `/dat-lich/../admin` (thành `/admin`) không lọt qua bước kiểm vai ở `returnPathFor`. Nhưng chuẩn hoá cũng có thể TẠO ra dạng
// bị cấm từ chuỗi thô hợp lệ: `/..//evil.com` và `/dat-lich/..//evil.com` thành `//evil.com`. Vì vậy kết quả được kiểm LẠI bằng
// đúng luật trên; chỉ khi cả chuỗi thô lẫn bản chuẩn hoá đều đạt mới trả về (phiên kiểm giai đoạn 1, BRT-04 mở rộng và BRT-11).
export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !isInternalPath(raw)) return null;
  const url = new URL(raw, PROBE_ORIGIN);
  const normalized = url.pathname + url.search + url.hash;
  return isInternalPath(normalized) ? normalized : null;
}

// `from` hợp lệ trong `location.state` (hoặc null)
export function readReturnTo(state: unknown): string | null {
  return safeReturnPath(textFrom(state, RETURN_TO_KEY));
}

// State để truyền `from` sang trang kế (đăng ký, xác minh): `base` giữ nguyên khi không có `from`, nên mọi nơi chưa có `from`
// hành xử đúng như trước.
export function withReturnTo<T extends object>(
  base: T | undefined,
  from: string | null,
): T | undefined | (T & { from: string }) {
  return from === null
    ? base
    : ({ ...base, [RETURN_TO_KEY]: from } as T & { from: string });
}

// State cho `<Navigate to={LOGIN_PATH}>` của `RequireAuth`: đường dẫn đang mở, hoặc undefined nếu không hợp lệ
export function returnToStateFor(location: {
  pathname: string;
  search: string;
  hash: string;
}): { from: string } | undefined {
  const from = safeReturnPath(
    location.pathname + location.search + location.hash,
  );
  return from === null ? undefined : { from };
}

function isBookingPath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0];
  return pathname === BOOKING_PATH || pathname.startsWith(`${BOOKING_PATH}/`);
}

// Đích sau khi đăng nhập: `from` chỉ được dùng khi hợp lệ VÀ hợp vai (hiện chỉ Bệnh nhân vào `/dat-lich/...`); còn lại là
// trang chủ của vai, đúng hành vi cũ.
export function returnPathFor(vaiTro: VaiTro, state: unknown): string {
  const from = readReturnTo(state);
  if (from !== null && vaiTro === 'BenhNhan' && isBookingPath(from)) {
    return from;
  }
  return homePathFor(vaiTro);
}
