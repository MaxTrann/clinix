import { request } from '../../../shared/api/client';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import type { Profile, ProfileUpdate } from './profile-types';

const ISO_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

const isText = (value: unknown): value is string => typeof value === 'string';
const isTextOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

// Kiểm vừa đủ để trang không vỡ (TRACKING F3-C): chỉ sáu khoá sẽ được vẽ ra. Các khoá khác (vaiTro, chiNhanh, ...) bỏ qua.
// `gioiTinh` lạ KHÔNG bị loại: nó vẫn là chuỗi, trang hiển thị "Chưa cập nhật". `restoreSession` tin trọn hợp đồng của /auth/me;
// ở đây sai kiểu nghĩa là trang trắng, nên coi như phản hồi không dùng được (cùng loại với HTML 502).
export function parseProfile(raw: unknown): Profile {
  if (typeof raw !== 'object' || raw === null) {
    throw new UnexpectedResponseError(200);
  }
  const { hoTen, email, soDienThoai, gioiTinh, ngaySinh, diaChi } =
    raw as Record<string, unknown>;
  if (
    !isText(hoTen) ||
    !isText(email) ||
    !isText(soDienThoai) ||
    !isTextOrNull(gioiTinh) ||
    !isTextOrNull(diaChi) ||
    !(ngaySinh === null || (isText(ngaySinh) && ISO_DATE.test(ngaySinh)))
  ) {
    throw new UnexpectedResponseError(200);
  }
  return { hoTen, email, soDienThoai, gioiTinh, ngaySinh, diaChi };
}

export async function getProfile(signal: AbortSignal): Promise<Profile> {
  return parseProfile(await request<unknown>('/profile', { signal }));
}

// Không truyền `signal`: rời trang giữa lúc lưu không được huỷ PUT (huỷ giữa chừng làm mất thông tin máy chủ đã ghi chưa).
// Đăng xuất vẫn huỷ được vì client gộp tín hiệu của phiên vào mọi yêu cầu.
export async function updateProfile(body: ProfileUpdate): Promise<Profile> {
  return parseProfile(
    await request<unknown>('/profile', { method: 'PUT', json: body }),
  );
}
