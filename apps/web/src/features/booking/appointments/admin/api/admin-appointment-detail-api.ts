import { request } from '../../../../../shared/api/client';
import { parseOperationsDetail } from '../../common/operations-appointment';
import {
  readIsoDateTime,
  readList,
  readRecord,
  readText,
} from '../../common/response-readers';
import type {
  AdminAppointmentDetail,
  HistoryEntry,
  HistoryKind,
} from './admin-appointment-types';

// Gọi và kiểm hình dạng `GET /admin/appointments/:maLichHen` (booking F10; hợp đồng B4: TRACKING 3.33.1, B4-E). Gắn access token. Chỉ đọc đúng các khoá cần: khoá thừa (kể cả `email`,
// `thanhToan` nếu máy chủ lỡ gửi) không bao giờ lọt ra màn hình.

const HISTORY_KINDS: readonly HistoryKind[] = [
  'TaoLich',
  'HuyLich',
  'OverrideLichHen',
];
const isHistoryKind = (value: string): value is HistoryKind =>
  (HISTORY_KINDS as readonly string[]).includes(value);

// Khoá tuỳ chọn của mục lịch sử: vắng hay `null` ⇒ `null`; có thì phải là chuỗi (sai kiểu ⇒ phản hồi không dùng được)
function readOptionalText(value: unknown): string | null {
  return value === undefined || value === null ? null : readText(value);
}

// Một mục: `thoiDiem` ISO và `loai` bắt buộc, ba khoá còn lại tuỳ chọn. Mục sai hình dạng ⇒ ném (cả phản hồi không dùng được, nếp F8). `loai` ngoài ba mã đã biết là khoá CỘNG THÊM
// của máy chủ mới hơn: bỏ mục đó (trả `null`), không làm vỡ trang và không hiện chữ thô.
function parseHistoryEntry(raw: unknown): HistoryEntry | null {
  const row = readRecord(raw);
  const thoiDiem = readIsoDateTime(row.thoiDiem);
  const loai = readText(row.loai);
  const entry = {
    thoiDiem,
    tuTrangThai: readOptionalText(row.tuTrangThai),
    denTrangThai: readOptionalText(row.denTrangThai),
    lyDo: readOptionalText(row.lyDo),
  };
  return isHistoryKind(loai) ? { ...entry, loai } : null;
}

// Đủ mười bảy khoá: mười sáu khoá của Lễ tân (dùng chung `parseOperationsDetail`) cộng `lichSuTrangThai` (mảng; có thể rỗng khi đọc lỗi, bình thường luôn có `TaoLich`).
export function parseAdminAppointmentDetail(
  raw: unknown,
): AdminAppointmentDetail {
  const body = readRecord(raw);
  return {
    ...parseOperationsDetail(body),
    lichSuTrangThai: readList(body.lichSuTrangThai)
      .map(parseHistoryEntry)
      .filter((entry): entry is HistoryEntry => entry !== null),
  };
}

// Đường dẫn API của một lịch hẹn; mã đi qua `encodeURIComponent` (backend tự chuẩn hoá chữ hoa và kiểm dạng, sai dạng ⇒ 404 cùng thân)
export const adminAppointmentApiPath = (maLichHen: string) =>
  `admin/appointments/${encodeURIComponent(maLichHen)}`;

export async function getAdminAppointment(
  maLichHen: string,
  signal?: AbortSignal,
): Promise<AdminAppointmentDetail> {
  return parseAdminAppointmentDetail(
    await request<unknown>(adminAppointmentApiPath(maLichHen), { signal }),
  );
}
