import { request } from '../../../shared/api/client';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import type {
  AdminScope,
  Profile,
  ProfileBranch,
  ProfileUpdate,
} from './profile-types';

const ISO_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
// Id chi nhánh là chuỗi số BIGINT (không qua Number, TRACKING F4-D)
const BRANCH_ID = /^[0-9]+$/;

const isText = (value: unknown): value is string => typeof value === 'string';
const isTextOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

function isBranch(value: unknown): value is ProfileBranch {
  if (typeof value !== 'object' || value === null) return false;
  const { chiNhanhId, ten } = value as Record<string, unknown>;
  return (
    isText(chiNhanhId) &&
    BRANCH_ID.test(chiNhanhId) &&
    isText(ten) &&
    ten !== ''
  );
}

// `null` hoặc thiếu đều hợp lệ (Bệnh nhân không có chi nhánh); sai hình dạng thì không (F4-D, cách O)
const isBranchOrAbsent = (value: unknown): boolean =>
  value === null || value === undefined || isBranch(value);

// Khác `chiNhanh`: phạm vi là MÃ để ánh xạ nhãn (như `gioiTinh`), nên mã lạ KHÔNG làm vỡ trang, chỉ bị coi như thiếu (F5-D)
const isAdminScope = (value: unknown): value is AdminScope =>
  value === 'ToanHeThong' || value === 'ChiNhanh';

// Kiểm vừa đủ để trang không vỡ (TRACKING F3-C): chỉ sáu khoá, `chiNhanh` (F4) và `phamViQuanTri` (F5) sẽ được vẽ ra. Các khoá khác (vaiTro, ...) bỏ qua.
// `gioiTinh` lạ KHÔNG bị loại: nó vẫn là chuỗi, trang hiển thị "Chưa cập nhật". `restoreSession` tin trọn hợp đồng của /auth/me;
// ở đây sai kiểu nghĩa là trang trắng, nên coi như phản hồi không dùng được (cùng loại với HTML 502).
export function parseProfile(raw: unknown): Profile {
  if (typeof raw !== 'object' || raw === null) {
    throw new UnexpectedResponseError(200);
  }
  const {
    hoTen,
    email,
    soDienThoai,
    gioiTinh,
    ngaySinh,
    diaChi,
    chiNhanh,
    phamViQuanTri,
  } = raw as Record<string, unknown>;
  if (
    !isText(hoTen) ||
    !isText(email) ||
    !isText(soDienThoai) ||
    !isTextOrNull(gioiTinh) ||
    !isTextOrNull(diaChi) ||
    !isBranchOrAbsent(chiNhanh) ||
    !(ngaySinh === null || (isText(ngaySinh) && ISO_DATE.test(ngaySinh)))
  ) {
    throw new UnexpectedResponseError(200);
  }
  const profile: Profile = {
    hoTen,
    email,
    soDienThoai,
    gioiTinh,
    ngaySinh,
    diaChi,
  };
  // Chỉ thêm khoá khi có chi nhánh hay phạm vi hợp lệ: Bệnh nhân (`chiNhanh: null`, `phamViQuanTri: null`) nhận về đúng sáu khoá như F3,
  // Lễ tân thêm `chiNhanh`, Quản trị viên thêm `phamViQuanTri` (và `chiNhanh` khi phạm vi Chi nhánh). Chỉ giữ hai khoá đã kiểm của chi nhánh.
  if (isBranch(chiNhanh)) {
    profile.chiNhanh = { chiNhanhId: chiNhanh.chiNhanhId, ten: chiNhanh.ten };
  }
  if (isAdminScope(phamViQuanTri)) profile.phamViQuanTri = phamViQuanTri;
  return profile;
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
