import { request } from '../../../../../shared/api/client';
import {
  parseRescheduleCandidate,
  parseRescheduleCurrent,
  parseRescheduleDone,
  readOptionalText,
  type RescheduleDone,
} from '../../common/reschedule-payload';
import {
  readFlag,
  readIsoDateTime,
  readRecord,
  readText,
  unusableResponse,
} from '../../common/response-readers';
import { receptionAppointmentApiPath } from '../api/reception-appointment-detail-api';
import type {
  ReceptionRescheduleInput,
  ReceptionReschedulePreview,
} from './reception-reschedule-types';

// Gọi và kiểm hình dạng hai route đổi lịch HỘ của Lễ tân (reschedule F3; PLAN reschedule 5.8; hợp đồng THẬT của B7: TRACKING mục 7). Hai route của Lễ tân nên GẮN access token (mặc định của `request()`); chi nhánh do
// backend lấy từ tài khoản, web không gửi. Bộ đọc NGHIÊM: thiếu khoá hay sai kiểu ⇒ `UnexpectedResponseError`; khoá thừa (kể cả `loai`, `soLanDaDoi`, `soLanToiDa` của preview Bệnh nhân) KHÔNG bao giờ được chép ra
// kết quả. Ở pha GỬI, `UnexpectedResponseError` là "chưa rõ" (máy chủ có thể đã ghi).

export function parseReceptionReschedulePreview(
  raw: unknown,
): ReceptionReschedulePreview {
  const body = readRecord(raw);
  const reason = readOptionalText(body.lyDoKhongDoi);
  return {
    choPhepDoi: readFlag(body.choPhepDoi),
    ...(reason === undefined ? {} : { lyDoKhongDoi: reason }),
    coYeuCauChoDuyet: readFlag(body.coYeuCauChoDuyet),
    lichCu: parseRescheduleCurrent(body.lichCu),
    lichMoi: parseRescheduleCandidate(body.lichMoi),
    thoiGianMayChu: readIsoDateTime(body.thoiGianMayChu),
  };
}

// 201: chỉ có `DaDoi` (đổi hộ không có nhánh gửi yêu cầu). `ketQua` khác (kể cả `DaGuiYeuCau`) là hợp đồng gãy, không đoán.
export function parseReceptionRescheduleResult(raw: unknown): RescheduleDone {
  const body = readRecord(raw);
  return readText(body.ketQua) === 'DaDoi'
    ? parseRescheduleDone(body)
    : unusableResponse();
}

// `khungGioId = null` ⇒ không gửi query: máy chủ chỉ trả điều kiện đổi (dùng cho trang chọn khung giờ). Có ⇒ id đi nguyên chuỗi (`request()` mã hoá query).
export async function getReceptionReschedulePreview(
  maLichHen: string,
  khungGioId: string | null,
  signal?: AbortSignal,
): Promise<ReceptionReschedulePreview> {
  return parseReceptionReschedulePreview(
    await request<unknown>(
      `${receptionAppointmentApiPath(maLichHen)}/reschedule-preview`,
      {
        query: khungGioId === null ? undefined : { khungGioId },
        signal,
      },
    ),
  );
}

// Không truyền `signal`: yêu cầu đã gửi thì máy chủ vẫn xử lý dù trang bị gỡ, nên huỷ ở client chỉ làm người dùng không biết kết quả (nếp hộp huỷ lịch). Hạn chờ 15 giây là của `request()` (`TimeoutError`).
// Thân chỉ có `khungGioId` và `lyDo` (KHÔNG `lyDoYeuCau`, `chiNhanhId`, `benhNhanId`).
export async function submitReceptionReschedule(
  maLichHen: string,
  input: ReceptionRescheduleInput,
): Promise<RescheduleDone> {
  return parseReceptionRescheduleResult(
    await request<unknown>(
      `${receptionAppointmentApiPath(maLichHen)}/reschedule`,
      {
        method: 'POST',
        json: { khungGioId: input.khungGioId, lyDo: input.lyDo },
      },
    ),
  );
}
