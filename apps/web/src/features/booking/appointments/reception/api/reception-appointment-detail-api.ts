import { request } from '../../../../../shared/api/client';
import { parseOperationsDetail } from '../../common/operations-appointment';
import { readFlag, readRecord } from '../../common/response-readers';
import type { ReceptionAppointmentDetail } from './reception-appointment-types';

// Gọi và kiểm hình dạng `GET /reception/appointments/:maLichHen` (booking F8; hợp đồng B3: TRACKING 3.17.1, 3.28 F8-D). Gắn access token. Chỉ đọc đúng các khoá
// cần: khoá thừa không bao giờ lọt ra màn hình.

// Đủ mười sáu khoá (mười một của dòng danh sách cộng `lyDoKham`, `lyDoHuy`, `hanThanhToan`, `chuyenDuoc`, `conPhaiThu`) do bộ đọc CHUNG `parseOperationsDetail` ở `common/operations-appointment.ts` (F10; Quản trị
// viên dùng lại) cộng HAI cờ đổi lịch chỉ có ở Lễ tân (reschedule F3, WDO-10; B5): `choPhepDoiLich` và `coYeuCauChoDuyet`. Đọc NGHIÊM: thiếu hay sai kiểu ⇒ `UnexpectedResponseError` (không đoán "đổi được").
export function parseReceptionAppointmentDetail(
  raw: unknown,
): ReceptionAppointmentDetail {
  const body = readRecord(raw);
  return {
    ...parseOperationsDetail(body),
    choPhepDoiLich: readFlag(body.choPhepDoiLich),
    coYeuCauChoDuyet: readFlag(body.coYeuCauChoDuyet),
  };
}

// Đường dẫn API của một lịch hẹn; mã đi qua `encodeURIComponent` (backend tự chuẩn hoá chữ hoa và kiểm dạng, sai dạng ⇒ 404 cùng thân)
export const receptionAppointmentApiPath = (maLichHen: string) =>
  `reception/appointments/${encodeURIComponent(maLichHen)}`;

export async function getReceptionAppointment(
  maLichHen: string,
  signal?: AbortSignal,
): Promise<ReceptionAppointmentDetail> {
  return parseReceptionAppointmentDetail(
    await request<unknown>(receptionAppointmentApiPath(maLichHen), { signal }),
  );
}
