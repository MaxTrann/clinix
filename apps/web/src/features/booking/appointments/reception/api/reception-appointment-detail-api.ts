import { request } from '../../../../../shared/api/client';
import {
  readAmount,
  readIsoDateTime,
  readList,
  readRecord,
  readText,
} from '../../common/response-readers';
import { parseReceptionAppointment } from './reception-appointments-api';
import type { ReceptionAppointmentDetail } from './reception-appointment-types';

// Gọi và kiểm hình dạng `GET /reception/appointments/:maLichHen` (booking F8; hợp đồng B3: TRACKING 3.17.1, 3.28 F8-D). Gắn access token. Chỉ đọc đúng các khoá
// cần: khoá thừa không bao giờ lọt ra màn hình.

// Đủ mười sáu khoá: mười một của dòng danh sách (dùng lại `parseReceptionAppointment`) cộng `lyDoKham`, `lyDoHuy`, `hanThanhToan`, `chuyenDuoc`, `conPhaiThu`.
// Thiếu một khoá (kể cả khoá vốn có thể `null` nhưng luôn có mặt) ⇒ phản hồi không dùng được. `chuyenDuoc` là mảng chuỗi (mã trạng thái), có thể rỗng.
export function parseReceptionAppointmentDetail(
  raw: unknown,
): ReceptionAppointmentDetail {
  const body = readRecord(raw);
  return {
    ...parseReceptionAppointment(body),
    lyDoKham: body.lyDoKham === null ? null : readText(body.lyDoKham),
    lyDoHuy: body.lyDoHuy === null ? null : readText(body.lyDoHuy),
    hanThanhToan:
      body.hanThanhToan === null ? null : readIsoDateTime(body.hanThanhToan),
    chuyenDuoc: readList(body.chuyenDuoc).map((target) => readText(target)),
    conPhaiThu: body.conPhaiThu === null ? null : readAmount(body.conPhaiThu),
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
