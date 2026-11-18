import { request } from '../../shared/api/client';
import type { ActivationLink } from './activation-link';

// Hai lời gọi công khai của B16 (`POST /staff-activation/validate` và `/complete`). Token CHỈ nằm ở thân POST: không query, không header.
// `skipAuthToken`: không gắn Authorization dù người dùng đang có phiên (API bỏ qua phiên, và access token không liên quan tới liên kết).

// 200 `{ hopLe: true }`; liên kết không dùng được ⇒ 400 `LIEN_KET_KHONG_HOP_LE`. Chỉ đọc: không ghi, không khoá, nên gọi lại vô hại.
export async function validateActivationLink(
  link: ActivationLink,
  signal?: AbortSignal,
): Promise<void> {
  await request('/staff-activation/validate', {
    method: 'POST',
    json: { id: link.id, token: link.token },
    skipAuthToken: true,
    signal,
  });
}

// 200 `{ daKichHoat: true }`. Đúng bốn trường (trường lạ bị API từ chối, SE-A2); không đăng nhập tự động.
export async function completeActivation(
  link: ActivationLink,
  matKhauMoi: string,
  xacNhan: string,
): Promise<void> {
  await request('/staff-activation/complete', {
    method: 'POST',
    json: { id: link.id, token: link.token, matKhauMoi, xacNhan },
    skipAuthToken: true,
  });
}
