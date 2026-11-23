import { request } from '../../../shared/api/client';
import type {
  DependentAppointment,
  DependentList,
  DependentShift,
  DoctorDependents,
  ResendOutcome,
} from './staff-types';

// Lời gọi ghi lên tài khoản nhân sự (admin F8): khoá và mở khoá (B18), gửi lại liên kết kích hoạt (B20). Danh sách và chi tiết đọc bằng `listAccounts`
// và `getAccount` của `account-common`. Mỗi lệnh ghi gửi MỘT lần, KHÔNG thân, không tự thử lại: mất mạng hay hết hạn chờ thì người dùng tự bấm lại
// sau khi đã tải lại và thấy trạng thái thật. Phản hồi được đọc bằng bộ đọc có gác kiểu: khoá lạ của API không bao giờ được vẽ ra.

const actionPath = (id: string, action: string) =>
  `/admin/accounts/${encodeURIComponent(id)}/${action}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** Đọc một danh sách `{ tong, muc }`; chỉ giữ các khoá do `readItem` liệt kê. Một mục sai hình dạng thì cả danh sách là `null`. */
function readList<T>(
  value: unknown,
  readItem: (item: Record<string, unknown>) => T | null,
): DependentList<T> | null {
  if (!isRecord(value) || !isCount(value.tong) || !Array.isArray(value.muc))
    return null;
  const items: T[] = [];
  for (const raw of value.muc) {
    const item = isRecord(raw) ? readItem(raw) : null;
    if (item === null) return null;
    items.push(item);
  }
  return { tong: value.tong, muc: items };
}

const text = (value: unknown): value is string => typeof value === 'string';

function readAppointment(
  item: Record<string, unknown>,
): DependentAppointment | null {
  const { lichHenId, maLichHen, thoiGian, trangThai } = item;
  if (
    !text(lichHenId) ||
    !text(maLichHen) ||
    !text(thoiGian) ||
    !text(trangThai)
  )
    return null;
  return { lichHenId, maLichHen, thoiGian, trangThai };
}

function readShift(item: Record<string, unknown>): DependentShift | null {
  const { lichLamViecId, ngay, ca } = item;
  if (!text(lichLamViecId) || !text(ngay) || !text(ca)) return null;
  return { lichLamViecId, ngay, ca };
}

/**
 * `phuThuoc` của phản hồi khoá Bác sĩ (Q28). `null` khi vắng (nhân sự khác Bác sĩ) hay sai hình dạng: khi đó web KHÔNG nói gì về việc phụ thuộc,
 * chứ không nói "không có việc nào". Danh sách rỗng đúng hình dạng thì là kết quả hợp lệ.
 */
export function parseDependents(value: unknown): DoctorDependents | null {
  if (!isRecord(value)) return null;
  const lichHen = readList(value.lichHen, readAppointment);
  const caLamViec = readList(value.caLamViec, readShift);
  return lichHen === null || caLamViec === null ? null : { lichHen, caLamViec };
}

/** Khoá tài khoản. Trả danh sách việc phụ thuộc khi đích là Bác sĩ, còn lại `null`. Lỗi HTTP được ném nguyên cho nơi gọi. */
export async function lockStaff(id: string): Promise<DoctorDependents | null> {
  const body = await request<unknown>(actionPath(id, 'lock'), {
    method: 'POST',
  });
  return isRecord(body) ? parseDependents(body.phuThuoc) : null;
}

/** Mở khoá tài khoản; phản hồi thành công không được đọc (nơi gọi luôn tải lại chi tiết). */
export async function unlockStaff(id: string): Promise<void> {
  await request(actionPath(id, 'unlock'), { method: 'POST' });
}

/**
 * Gửi lại email kích hoạt. Gửi thư lỗi vẫn là HTTP 200 (`guiEmail.ketQua = 'ThatBai'`): chỉ `DaGui` mới là đã gửi, mọi dạng không nhận ra là `unknown`.
 */
export async function resendActivation(id: string): Promise<ResendOutcome> {
  const body = await request<unknown>(actionPath(id, 'resend-activation'), {
    method: 'POST',
  });
  if (!isRecord(body) || !isRecord(body.guiEmail)) return { kind: 'unknown' };
  if (body.guiEmail.ketQua === 'DaGui')
    return {
      kind: 'sent',
      hanLienKet: text(body.hanLienKet) ? body.hanLienKet : null,
    };
  if (body.guiEmail.ketQua === 'ThatBai') return { kind: 'mailFailed' };
  return { kind: 'unknown' };
}
